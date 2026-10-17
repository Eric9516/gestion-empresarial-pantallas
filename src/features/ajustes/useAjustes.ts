import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { cursorSiguiente, POR_PAGINA, type Cursor } from '../../lib/paginacion';
import { finDelDiaISO, inicioDelDiaISO } from '../../lib/fechaHoy';
import { supabase } from '../../lib/supabaseClient';
import { fetchUsuariosPorIds, nombreUsuario } from '../../lib/usuarios';
import type { ClaseMovimiento, TipoAjuste } from '../../lib/ajustes';

export interface AjusteLinea {
  id: string;
  tipo: TipoAjuste;
  cantidad: number;
  stock_antes: number | null;
  stock_despues: number | null;
  items: { codigo: string; descripcion: string; unidad: string } | null;
}

export interface Ajuste {
  id: string;
  created_at: string;
  usuario_id: string;
  clase: ClaseMovimiento;
  fecha: string;
  punto_venta: number;
  numero: number;
  referencia: string | null;
  observaciones: string | null;
  motivo: string;
  anulado: boolean;
  anulado_por: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  ajuste_items: AjusteLinea[];
  usuarioNombre: string;
  anuladoPorNombre: string | null;
}

const CLAVE = ['ajustes'] as const;

interface LineaDeLaBase { id: string; tipo: TipoAjuste; cantidad: number | string; stock_antes: number | string | null; stock_despues: number | string | null; codigo: string | null; descripcion: string | null; unidad: string | null }

export interface FiltrosDeMovimientos { texto: string; filtro: string; desde: string; hasta: string }

// Los movimientos (cargas y ajustes) con sus líneas, de a páginas, los más nuevos primero. La búsqueda, el tipo y las fechas los filtra la base. Solo los puede leer quien
// puede ajustar (la base lo impone).
export function useAjustesQuery(f: FiltrosDeMovimientos) {
  const texto = f.texto.trim();
  const q = useInfiniteQuery({
    queryKey: [...CLAVE, texto, f.filtro, f.desde, f.hasta],
    initialPageParam: null as Cursor | null,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<Ajuste[]> => {
      const { data, error } = await supabase.rpc('lista_de_movimientos', {
        p_texto: texto || undefined, p_filtro: f.filtro, p_desde: f.desde ? inicioDelDiaISO(f.desde) : undefined, p_hasta: f.hasta ? finDelDiaISO(f.hasta) : undefined,
        p_antes_en: pageParam?.created_at, p_antes_id: pageParam?.id, p_limite: POR_PAGINA,
      });
      if (error) throw error;
      const filas = data ?? [];
      const usuarios = await fetchUsuariosPorIds(filas.flatMap(a => [a.usuario_id, a.anulado_por].filter((x): x is string => !!x)));
      return filas.map(a => ({
        id: a.id, created_at: a.created_at, usuario_id: a.usuario_id, clase: a.clase as ClaseMovimiento, fecha: a.fecha, punto_venta: a.punto_venta, numero: Number(a.numero),
        referencia: a.referencia, observaciones: a.observaciones, motivo: a.motivo, anulado: a.anulado, anulado_por: a.anulado_por, anulado_at: a.anulado_at, motivo_anulacion: a.motivo_anulacion,
        ajuste_items: ((a.lineas ?? []) as unknown as LineaDeLaBase[]).map(l => ({
          id: l.id, tipo: l.tipo, cantidad: Number(l.cantidad), stock_antes: l.stock_antes === null ? null : Number(l.stock_antes), stock_despues: l.stock_despues === null ? null : Number(l.stock_despues),
          items: l.codigo === null && l.descripcion === null ? null : { codigo: l.codigo ?? '', descripcion: l.descripcion ?? '', unidad: l.unidad ?? 'Uni' },
        })),
        usuarioNombre: nombreUsuario(usuarios[a.usuario_id], a.usuario_id),
        anuladoPorNombre: a.anulado_por ? nombreUsuario(usuarios[a.anulado_por], a.anulado_por) : null,
      }));
    },
    getNextPageParam: pagina => cursorSiguiente(pagina),
  });
  const ajustes = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  return {
    ajustes, isLoading: q.isLoading, isError: q.isError, hayMas: !!q.hasNextPage, cargandoMas: q.isFetchingNextPage, verMas: () => void q.fetchNextPage(),
    buscando: q.isFetching && !q.isFetchingNextPage,
  };
}

// Después de ajustar o anular cambia el stock de los repuestos y su historial: se vuelve a leer todo eso.
function useRefrescarTodo() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: CLAVE });
    void queryClient.invalidateQueries({ queryKey: ['items'] });
    void queryClient.invalidateQueries({ queryKey: ['historial-por-item'] });
  };
}

// Una carga de stock o un ajuste: un documento con su número, todo o nada. Devuelve el comprobante (por ejemplo "CAR 0001-00000012").
export function useCrearMovimiento() {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: async (m: { clase: ClaseMovimiento; fecha: string; motivo: string; referencia: string; observaciones: string; lineas: { item_id: string; tipo: TipoAjuste; cantidad: number }[] }) => {
      const { data, error } = await supabase.rpc('crear_movimiento_stock', { p_clase: m.clase, p_fecha: m.fecha, p_motivo: m.motivo, p_referencia: m.referencia, p_observaciones: m.observaciones, p_lineas: m.lineas });
      if (error) throw error;
      return data as { id: string; comprobante: string };
    },
    onSuccess: refrescar,
  });
}

export function useAnularAjuste() {
  const refrescar = useRefrescarTodo();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      const { error } = await supabase.rpc('anular_ajuste_inventario', { p_ajuste_id: id, p_motivo: motivo });
      if (error) throw error;
    },
    onSuccess: refrescar,
  });
}
