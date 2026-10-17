import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { cursorSiguiente, POR_PAGINA, type Cursor } from '../../lib/paginacion';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { puedeVerTodosLosRetiros } from '../../lib/types';
import { exportarExcel } from '../../lib/exportExcel';
import { nombreUsuario, type UsuarioBasico } from '../../lib/usuarios';
import type { RetiroCartLine } from './RetiroCartContext';
import { finDelDiaISO, inicioDelDiaISO } from '../../lib/fechaHoy';

export interface RetiroHistorialItem {
  id: string;
  cantidad: number;
  observacion: string | null;
  items: { codigo: string; descripcion: string } | null;
}

export interface RetiroHistorial {
  id: string;
  usuario_id: string;
  created_at: string;
  observacion_general: string | null;
  sectores: { nombre: string } | null;
  retiro_items: RetiroHistorialItem[];
}

async function fetchUsuariosPerfil() {
  const { data, error } = await supabase.from('usuarios_perfil').select('id, nombre, apellido, email');
  if (error) throw error;
  return data;
}

// El stock no puede quedar negativo (lo hace cumplir la base). Antes de confirmar se mira el stock de ahora de cada línea y se avisa de TODAS las que no alcanzan juntas,
// en vez de que la base rechace el retiro por la primera. (Si en el medio otra persona saca el último, la base igual lo rechaza: esto es solo para avisar mejor.)
export async function stockQueFalta(lineas: { item_id: string; codigo: string; cantidad: number }[]) {
  const { data, error } = await supabase.from('items').select('id, stock').in('id', lineas.map(l => l.item_id));
  if (error) throw error;
  const hay = new Map((data ?? []).map(r => [r.id, r.stock ?? 0]));
  return lineas.filter(l => l.cantidad > (hay.get(l.item_id) ?? 0)).map(l => ({ codigo: l.codigo, hay: hay.get(l.item_id) ?? 0, pide: l.cantidad }));
}

export function useConfirmarRetiro() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ sectorId, observacionGeneral, items }: { sectorId: string; observacionGeneral: string; items: RetiroCartLine[] }) => {
      if (!profile) throw new Error('Sesión no disponible');
      // Una sola operación en la base: el retiro y todas sus líneas, o nada (antes eran dos pedidos y si fallaba el segundo quedaba un retiro vacío).
      const { data, error } = await supabase.rpc('confirmar_retiro', {
        p_sector_id: sectorId,
        p_observacion: observacionGeneral,
        p_lineas: items.map(line => ({ item_id: line.item_id, cantidad: line.cantidad, observacion: line.observacion || '' })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['historial-retiros'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['historial-por-item'] });
    },
  });
}

// Las líneas de un retiro vienen armadas desde la base.
interface LineaDeRetiro { id: string; cantidad: number | string; observacion: string | null; codigo: string | null; descripcion: string | null }

// El historial de retiros se pide de a páginas (los más nuevos primero) y la búsqueda, la fecha y el usuario los filtra la base. Sin fecha, son los últimos 30 días.
export function useHistorialRetirosQuery(fechaFiltro: string, usuarioFiltro: string, texto = '') {
  const { profile } = useAuth();
  const admin = puedeVerTodosLosRetiros(profile);
  const busqueda = texto.trim();

  const retirosQuery = useInfiniteQuery({
    queryKey: ['historial-retiros', fechaFiltro, usuarioFiltro, busqueda, admin],
    initialPageParam: null as Cursor | null,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<RetiroHistorial[]> => {
      let desde: string;
      let hasta: string | undefined;
      if (fechaFiltro) {
        desde = inicioDelDiaISO(fechaFiltro);
        hasta = finDelDiaISO(fechaFiltro);
      } else {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        desde = d.toISOString();
      }
      const { data, error } = await supabase.rpc('historial_de_retiros', {
        p_texto: busqueda || undefined, p_desde: desde, p_hasta: hasta, p_usuario: usuarioFiltro || undefined,
        p_antes_en: pageParam?.created_at, p_antes_id: pageParam?.id, p_limite: POR_PAGINA,
      });
      if (error) throw error;
      return (data ?? []).map(r => ({
        id: r.id, usuario_id: r.usuario_id, created_at: r.created_at, observacion_general: r.observacion_general,
        sectores: r.sector ? { nombre: r.sector } : null,
        retiro_items: ((r.lineas ?? []) as unknown as LineaDeRetiro[]).map(l => ({
          id: l.id, cantidad: Number(l.cantidad), observacion: l.observacion,
          items: l.codigo === null && l.descripcion === null ? null : { codigo: l.codigo ?? '', descripcion: l.descripcion ?? '' },
        })),
      }));
    },
    getNextPageParam: pagina => cursorSiguiente(pagina),
  });

  const usuariosQuery = useQuery({
    queryKey: ['usuarios-perfil-nombres'],
    enabled: admin,
    queryFn: fetchUsuariosPerfil,
  });

  const retiros = useMemo(() => retirosQuery.data?.pages.flat() ?? [], [retirosQuery.data]);

  return {
    retiros, admin, usuarios: usuariosQuery.data ?? [], isLoading: retirosQuery.isLoading, isError: retirosQuery.isError,
    hayMas: !!retirosQuery.hasNextPage, cargandoMas: retirosQuery.isFetchingNextPage, verMas: () => void retirosQuery.fetchNextPage(),
    buscando: retirosQuery.isFetching && !retirosQuery.isFetchingNextPage,
  };
}

export function useUpdateHistorialCantidad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, cantidad }: { id: string; cantidad: number }) => {
      const { error } = await supabase.from('retiro_items').update({ cantidad }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['historial-retiros'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['historial-por-item'] });
    },
  });
}

// ===== EXPORTAR A EXCEL (admin) =====

const COLUMNAS_RETIRO = 'id, usuario_id, created_at, observacion_general, sectores(nombre), retiro_items(id, cantidad, observacion, items(codigo, descripcion))';
const TANDA_DE_EXPORTACION = 500;

// Lee los retiros que se van a exportar de a 500 (del más viejo al más nuevo), para no pedir miles de retiros en un solo pedido.
async function leerRetirosParaExportar(filtro: { pendientes: true } | { desde: string; hasta: string }): Promise<RetiroParaExportar[]> {
  const todos: RetiroParaExportar[] = [];
  let cursor: Cursor | null = null;
  for (;;) {
    let q = supabase.from('retiros').select(COLUMNAS_RETIRO + ', exportado').order('created_at', { ascending: true }).order('id', { ascending: true }).limit(TANDA_DE_EXPORTACION);
    if ('pendientes' in filtro) q = q.eq('exportado', false);
    else q = q.gte('created_at', inicioDelDiaISO(filtro.desde)).lte('created_at', finDelDiaISO(filtro.hasta));
    if (cursor) q = q.or(`created_at.gt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.gt."${cursor.id}")`);
    const { data, error } = await q;
    if (error) throw error;
    const tanda = (data ?? []) as unknown as RetiroParaExportar[];
    todos.push(...tanda);
    if (tanda.length < TANDA_DE_EXPORTACION) return todos;
    const ultimo = tanda[tanda.length - 1];
    cursor = { created_at: ultimo.created_at, id: ultimo.id };
  }
}

interface RetiroParaExportar extends RetiroHistorial {
  exportado?: boolean;
}

function retirosAFilas(retiros: RetiroParaExportar[], usuarios: Record<string, UsuarioBasico>) {
  const filas: Record<string, string | number>[] = [];
  for (const r of retiros) {
    const usuarioNombre = nombreUsuario(usuarios[r.usuario_id], r.usuario_id);
    for (const ri of r.retiro_items) {
      filas.push({
        Fecha: new Date(r.created_at).toLocaleString('es-AR'),
        Usuario: usuarioNombre,
        Sector: r.sectores?.nombre || '',
        Código: ri.items?.codigo || '',
        Descripción: ri.items?.descripcion || '',
        Cantidad: ri.cantidad,
        Observación: ri.observacion || '',
        'Observación general': r.observacion_general || '',
      });
    }
  }
  return filas;
}

async function fetchUsuariosPorId() {
  const data = await fetchUsuariosPerfil();
  return Object.fromEntries(data.map(u => [u.id, u]));
}

// Marca cada retiro exportado como tal — la próxima vez que se pida "exportar
// pendientes" no vuelve a traer los que ya se descargaron una vez.
export function useExportarRetirosPendientes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const retiros = await leerRetirosParaExportar({ pendientes: true });
      if (!retiros?.length) return 0;

      const usuarios = await fetchUsuariosPorId();
      await exportarExcel(retirosAFilas(retiros, usuarios), 'Retiros', `retiros_pendientes_${new Date().toISOString().slice(0, 10)}.xlsx`);

      // Se marcan de a 100 por pedido (no uno por uno).
      for (let i = 0; i < retiros.length; i += 100) {
        const { error: errMarca } = await supabase.from('retiros').update({ exportado: true }).in('id', retiros.slice(i, i + 100).map(r => r.id));
        if (errMarca) throw errMarca;
      }
      return retiros.length;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['historial-retiros'] }); },
  });
}

export function useExportarRetirosPeriodo() {
  return useMutation({
    mutationFn: async ({ desde, hasta }: { desde: string; hasta: string }) => {
      const retiros = await leerRetirosParaExportar({ desde, hasta });
      if (!retiros?.length) return 0;

      const usuarios = await fetchUsuariosPorId();
      await exportarExcel(retirosAFilas(retiros, usuarios), 'Retiros', `retiros_${desde}_a_${hasta}.xlsx`);
      return retiros.length;
    },
  });
}

export function useDeleteHistorialItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ retiroItemId, retiroId }: { retiroItemId: string; retiroId: string }) => {
      const { error } = await supabase.from('retiro_items').delete().eq('id', retiroItemId);
      if (error) throw error;
      const { data: restantes } = await supabase.from('retiro_items').select('id').eq('retiro_id', retiroId);
      if (restantes && restantes.length === 0) {
        await supabase.from('retiros').delete().eq('id', retiroId);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['historial-retiros'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
      void queryClient.invalidateQueries({ queryKey: ['historial-por-item'] });
    },
  });
}
