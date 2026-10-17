import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { compressImage } from '../../lib/compressImage';
import { publicUrl } from '../../lib/storage';
import type { Database } from '../../lib/database.types';
import { ConflictoDeEdicion } from '../../lib/conflicto';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { opcionesFamilias, opcionesSubfamilias, type Familia, type Subfamilia } from '../familias/useFamilias';
import type { EstadoReposicion } from './reposicion';

// Columnas que la lista de repuestos NO trae: datos de auditoría (quién y cuándo subió la foto o borró el repuesto) que solo hacen falta en la papelera y en
// fotos pendientes, que los piden por su cuenta. Con miles de repuestos, no mandarlos por cada fila achica bastante lo que se descarga al abrir la app.
type ColumnasFueraDeLaLista = 'eliminado_at' | 'eliminado_por' | 'foto_subida_at' | 'foto_subida_at_2' | 'foto_subida_at_3' | 'foto_subida_por' | 'foto_subida_por_2' | 'foto_subida_por_3' | 'estado_reposicion_at' | 'created_at' | 'updated_at';

export type Item = Omit<Database['public']['Tables']['items']['Row'], ColumnasFueraDeLaLista> & {
  familias: Pick<Familia, 'id' | 'codigo' | 'nombre'> | null;
  subfamilias: Pick<Subfamilia, 'id' | 'codigo' | 'nombre'> | null;
};

// La familia y la subfamilia NO se piden pegadas a cada repuesto (se repetirían miles de veces): son listas chicas, se piden una vez aparte y se enchufan después.
const COLUMNAS_DE_LA_LISTA = 'id,codigo,numero,descripcion,detalles,ubicacion,unidad,stock,stock_minimo,punto_pedido,activo,familia_id,subfamilia_id,'
  + 'foto_url,foto_url_2,foto_url_3,foto_pendiente,foto_pendiente_2,foto_pendiente_3,estado_reposicion';

type RepuestoSinNombres = Omit<Item, 'familias' | 'subfamilias'>;

export type ItemInput = {
  familia_id: string;
  subfamilia_id: string;
  numero: string;
  descripcion: string;
  ubicacion: string;
  unidad: string;
  // Solo se usa al crear (entra como una "Carga inicial"); al editar, el stock no se escribe acá: cambia con un movimiento.
  stock: number | null;
  stock_minimo: number | null;
  punto_pedido: number | null;
  detalles: string;
};

const QUERY_KEY = ['items'] as const;

// ---------------------------------------------------------------------------------------------------------------------------------------------
// El catálogo vive en el servidor: la aplicación nunca lo descarga entero. Se busca con la función buscar_repuestos (índices de texto en la base)
// y se piden de a pocos. Funciona igual con 5.000 repuestos que con 500.000.
// ---------------------------------------------------------------------------------------------------------------------------------------------

// Lo que devuelve una búsqueda: lo justo para mostrar la lista. El repuesto completo (fotos, estado, etc.) se pide al abrirlo.
export interface RepuestoDeLista {
  id: string;
  codigo: string;
  numero: string;
  descripcion: string;
  detalles: string | null;
  ubicacion: string | null;
  stock: number | null;
  stock_minimo: number;
  punto_pedido: number;
  familia_id: string;
  subfamilia_id: string;
  foto_url: string | null;
  puntaje: number;
}

// La base no devuelve más de esta cantidad por búsqueda: si hay más, se afina la búsqueda (texto, familia o subfamilia).
export const LIMITE_DE_BUSQUEDA = 500;

export interface ParametrosDeBusqueda { texto: string; familiaId?: string; subfamiliaId?: string; limite?: number }

// Sin texto ni familia no se busca (no tiene sentido pedir "todo").
export const hayBusqueda = (p: ParametrosDeBusqueda) => p.texto.trim() !== '' || !!p.familiaId || !!p.subfamiliaId;

export async function buscarRepuestos(p: ParametrosDeBusqueda): Promise<RepuestoDeLista[]> {
  const { data, error } = await supabase.rpc('buscar_repuestos', {
    p_texto: p.texto.trim(),
    p_limite: Math.min(p.limite ?? 50, LIMITE_DE_BUSQUEDA),
    p_familia_id: p.familiaId || undefined,
    p_subfamilia_id: p.subfamiliaId || undefined,
  });
  if (error) throw error;
  return (data ?? []).map(r => ({ ...r, stock: r.stock === null ? null : Number(r.stock), stock_minimo: Number(r.stock_minimo), punto_pedido: Number(r.punto_pedido) }));
}

// Buscar en el catálogo. Mientras llega el resultado de una búsqueda nueva se sigue mostrando el anterior (la lista no parpadea).
export function useBuscarRepuestos(p: ParametrosDeBusqueda & { habilitada?: boolean }) {
  const texto = p.texto.trim();
  return useQuery({
    queryKey: ['items', 'buscar', texto, p.familiaId ?? '', p.subfamiliaId ?? '', p.limite ?? 50],
    enabled: (p.habilitada ?? true) && hayBusqueda(p),
    placeholderData: keepPreviousData,
    queryFn: () => buscarRepuestos({ ...p, texto }),
  });
}

// Para los selectores ("buscá un repuesto y agregalo"): los primeros resultados de lo que se va escribiendo, pidiéndolos a la base cuando la persona hace una pausa.
export function useRepuestosParaElegir(texto: string, limite = 15): RepuestoDeLista[] {
  const conPausa = useDebouncedValue(texto, 200);
  const { data } = useBuscarRepuestos({ texto: conPausa, limite });
  return texto.trim() ? (data ?? []) : [];
}

// Un repuesto completo (con su familia y subfamilia), para el detalle. Se pide al abrirlo y se renueva solo si cambia (fotos, edición, stock).
export function useRepuestoPorId(id: string | null) {
  return useQuery({
    queryKey: ['items', 'detalle', id],
    enabled: !!id,
    queryFn: async ({ client }): Promise<Item | null> => {
      const [fila, familias, subfamilias] = await Promise.all([
        supabase.from('items').select(COLUMNAS_DE_LA_LISTA).eq('id', id!).maybeSingle(),
        client.ensureQueryData({ ...opcionesFamilias, revalidateIfStale: true }),
        client.ensureQueryData({ ...opcionesSubfamilias, revalidateIfStale: true }),
      ]);
      if (fila.error) throw fila.error;
      if (!fila.data) return null;
      const r = fila.data as unknown as RepuestoSinNombres;
      return { ...r, familias: familias.find(x => x.id === r.familia_id) ?? null, subfamilias: subfamilias.find(x => x.id === r.subfamilia_id) ?? null };
    },
  });
}

// El stock de varios repuestos puntuales (por ejemplo, los del carrito de retiro): siempre el de ahora, nunca el de una lista vieja.
export function useStockDeRepuestos(ids: string[]) {
  const clave = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['items', 'stock', clave],
    enabled: ids.length > 0,
    staleTime: 5_000,
    queryFn: async (): Promise<Map<string, number | null>> => {
      const mapa = new Map<string, number | null>();
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase.from('items').select('id, stock').in('id', ids.slice(i, i + 100));
        if (error) throw error;
        for (const f of data ?? []) mapa.set(f.id, f.stock);
      }
      return mapa;
    },
  });
}

// Lo que hay que reponer (stock mínimo cargado y stock en el punto de pedido o por debajo), ya filtrado y ordenado por urgencia en la base. Trae hasta `limite`
// y, además, cuántos cumplen en total (para avisar si hay más de los que se muestran) y cuántos están sin stock.
export interface RepuestoAReponer {
  id: string;
  codigo: string;
  numero: string;
  descripcion: string;
  detalles: string | null;
  stock: number | null;
  stock_minimo: number;
  punto_pedido: number;
  familia_id: string;
  subfamilia_id: string;
  estado_reposicion: string | null;
}

export interface InformeDeReposicion { filas: RepuestoAReponer[]; total: number; totalSinStock: number }

export const LIMITE_DEL_INFORME = 500;
export const LIMITE_DEL_INFORME_PDF = 5000;

export interface FiltrosDeReposicion { texto?: string; familiaId?: string; estado?: string; limite?: number }

export async function repuestosAReponer(p: FiltrosDeReposicion): Promise<InformeDeReposicion> {
  const { data, error } = await supabase.rpc('repuestos_a_reponer', {
    p_texto: (p.texto ?? '').trim() || undefined,
    p_familia_id: p.familiaId || undefined,
    p_estado: p.estado || undefined,
    p_limite: p.limite ?? LIMITE_DEL_INFORME,
  });
  if (error) throw error;
  const filas = (data ?? []).map(({ total: _t, total_sin_stock: _s, ...r }) => ({
    ...r, stock: r.stock === null ? null : Number(r.stock), stock_minimo: Number(r.stock_minimo), punto_pedido: Number(r.punto_pedido),
  }));
  return { filas, total: Number(data?.[0]?.total ?? 0), totalSinStock: Number(data?.[0]?.total_sin_stock ?? 0) };
}

export function useRepuestosAReponer(p: FiltrosDeReposicion) {
  return useQuery({
    queryKey: ['items', 'a-reponer', (p.texto ?? '').trim(), p.familiaId ?? '', p.estado ?? '', p.limite ?? LIMITE_DEL_INFORME],
    placeholderData: keepPreviousData,
    queryFn: () => repuestosAReponer(p),
  });
}

// Un repuesto por su código exacto (por ejemplo, el que se lee de un QR). Devuelve null si no existe o está borrado.
export async function buscarRepuestoPorCodigo(codigo: string): Promise<{ id: string; codigo: string; descripcion: string } | null> {
  const { data, error } = await supabase.from('items').select('id, codigo, descripcion').eq('codigo', codigo).eq('activo', true).maybeSingle();
  if (error) throw error;
  return data;
}

// ¿Hay algún repuesto cargado? (para decir "todavía no hay repuestos" en vez de "sin resultados"). No cuenta ni descarga nada.
export function useHayRepuestos() {
  return useQuery({
    queryKey: ['items', 'hay'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('items').select('id').eq('activo', true).limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

// El repuesto tal como está AHORA en la base (con su versión). Se pide al abrir la edición: así se ve lo último y el guardado sabe sobre qué versión se hizo.
export function useRepuestoFresco(id: string | undefined) {
  return useQuery({
    queryKey: ['items', 'uno', id],
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('items').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
  });
}

// Crear: la base asigna el número si no se eligió uno (dos altas a la vez nunca reciben el mismo) y devuelve el repuesto creado, con su código.
// Editar: se guarda solo si nadie lo cambió desde que se abrió (`version` es su "actualizado el"); si lo cambiaron, avisa en vez de pisar.
export function useSaveItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, input, familia, subfamilia, version, numeroAutomatico, prefijo = 'M',
    }: { id: string | null; input: ItemInput; familia: Familia; subfamilia: Subfamilia; version?: string; numeroAutomatico?: boolean; prefijo?: string }): Promise<{ id: string; codigo: string }> => {
      if (id) {
        if (!version) throw new Error('Falta la versión del repuesto para guardar los cambios.');
        const numeroPad = input.numero.padStart(5, '0');
        const body = {
          // la letra del código es la del depósito del repuesto: al editar no cambia
          codigo: `${prefijo}${familia.codigo}${subfamilia.codigo}${numeroPad}`,
          numero: numeroPad,
          descripcion: input.descripcion,
          familia_id: input.familia_id,
          subfamilia_id: input.subfamilia_id,
          ubicacion: input.ubicacion || null,
          unidad: input.unidad.trim() || 'Uni',
          stock_minimo: input.stock_minimo ?? 0,
          punto_pedido: input.punto_pedido ?? 0,
          detalles: input.detalles || null,
        };
        const { data, error } = await supabase.from('items').update(body).eq('id', id).eq('updated_at', version).select('id');
        if (error) throw error;
        if (!data?.length) throw new ConflictoDeEdicion('este repuesto');
        return { id, codigo: body.codigo };
      }
      const { data, error } = await supabase.rpc('crear_repuesto', {
        p_familia_id: input.familia_id,
        p_subfamilia_id: input.subfamilia_id,
        p_numero: numeroAutomatico ? (null as unknown as string) : input.numero,
        p_descripcion: input.descripcion,
        p_ubicacion: input.ubicacion,
        p_unidad: input.unidad.trim() || 'Uni',
        p_stock: input.stock as number,
        p_stock_minimo: input.stock_minimo as number,
        p_punto_pedido: input.punto_pedido as number,
        p_detalles: input.detalles,
      });
      if (error) throw error;
      return { id: data.id, codigo: data.codigo };
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
    onError: e => { if (e instanceof ConflictoDeEdicion) void queryClient.invalidateQueries({ queryKey: ['items', 'uno'] }); },
  });
}

// Marca (o desmarca, con null) el estado de reposición de varios repuestos.
// La fecha "desde cuándo" la pone la base (y la lista no la trae); acá se vuelve a copiar el estado a la lista
// en memoria en vez de recargar los 5.000 repuestos. Se manda en tandas
// porque los ids viajan en la URL.
const TANDA_IDS = 100;

export function useMarcarEstadoReposicion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, estado }: { ids: string[]; estado: EstadoReposicion | null }) => {
      const actualizados: Pick<Item, 'id' | 'estado_reposicion'>[] = [];
      for (let i = 0; i < ids.length; i += TANDA_IDS) {
        const { data, error } = await supabase
          .from('items')
          .update({ estado_reposicion: estado })
          .in('id', ids.slice(i, i + TANDA_IDS))
          .select('id, estado_reposicion');
        if (error) throw error;
        actualizados.push(...data);
      }
      return actualizados;
    },
    onSuccess: actualizados => {
      const porId = new Map(actualizados.map(a => [a.id, a]));
      queryClient.setQueriesData<InformeDeReposicion>({ queryKey: ['items', 'a-reponer'] }, viejo => viejo && ({
        ...viejo,
        filas: viejo.filas.map(it => { const nuevo = porId.get(it.id); return nuevo ? { ...it, estado_reposicion: nuevo.estado_reposicion } : it; }),
      }));
      void queryClient.invalidateQueries({ queryKey: ['items', 'a-reponer'] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile) throw new Error('Sesión no disponible');
      const { error } = await supabase
        .from('items')
        .update({ activo: false, eliminado_por: profile.id, eliminado_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export type FotoSlot = 'foto_url' | 'foto_url_2' | 'foto_url_3';

export const SLOTS_FOTO: FotoSlot[] = ['foto_url', 'foto_url_2', 'foto_url_3'];

// Nombres de las columnas "pendiente"/"quién la subió"/"cuándo" para cada
// slot — se usa en ItemDetail y en el panel de fotos pendientes, en vez de
// repetir el mismo switch en cada lugar.
export const CAMPOS_POR_SLOT: Record<FotoSlot, {
  pendiente: 'foto_pendiente' | 'foto_pendiente_2' | 'foto_pendiente_3';
  subidaPor: 'foto_subida_por' | 'foto_subida_por_2' | 'foto_subida_por_3';
  subidaAt: 'foto_subida_at' | 'foto_subida_at_2' | 'foto_subida_at_3';
}> = {
  foto_url: { pendiente: 'foto_pendiente', subidaPor: 'foto_subida_por', subidaAt: 'foto_subida_at' },
  foto_url_2: { pendiente: 'foto_pendiente_2', subidaPor: 'foto_subida_por_2', subidaAt: 'foto_subida_at_2' },
  foto_url_3: { pendiente: 'foto_pendiente_3', subidaPor: 'foto_subida_por_3', subidaAt: 'foto_subida_at_3' },
};

type ItemsUpdate = Database['public']['Tables']['items']['Update'];

// Supabase tipa `.update()` de forma estricta (rechaza objetos armados con
// una clave calculada tipo `{ [slot]: valor }`), así que el valor por slot
// se arma acá con un switch explícito, una sola vez, en vez de repetirlo en
// cada mutación.
function bodyDeSlot(slot: FotoSlot, valor: string | null): ItemsUpdate {
  switch (slot) {
    case 'foto_url': return { foto_url: valor };
    case 'foto_url_2': return { foto_url_2: valor };
    case 'foto_url_3': return { foto_url_3: valor };
  }
}

export function useUploadItemFoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file, slot = 'foto_url' }: { id: string; file: File; slot?: FotoSlot }) => {
      const blob = await compressImage(file);
      const path = `${id}/${slot}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('items').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;
      const url = publicUrl('items', path);
      const { error } = await supabase.from('items').update(bodyDeSlot(slot, url)).eq('id', id);
      if (error) throw error;
      return url;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

// Intercambia el contenido de un slot con foto_url (el que se muestra como
// miniatura en las listas) — así "elegir cuál se usa como miniatura" nunca
// necesita una columna nueva, sea cual sea la foto elegida entre las 3.
export function useSwapItemFotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, item, targetSlot }: { id: string; item: Pick<Item, FotoSlot>; targetSlot: Exclude<FotoSlot, 'foto_url'> }) => {
      const { error } = await supabase.from('items').update({ ...bodyDeSlot(targetSlot, item.foto_url), foto_url: item[targetSlot] }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useDeleteItemFoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fotoUrl, slot = 'foto_url' }: { id: string; fotoUrl: string; slot?: FotoSlot }) => {
      const marker = '/storage/v1/object/public/items/';
      const idx = fotoUrl.indexOf(marker);
      if (idx !== -1) {
        await supabase.storage.from('items').remove([fotoUrl.slice(idx + marker.length)]).catch(() => {});
      }
      const { error } = await supabase.from('items').update(bodyDeSlot(slot, null)).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
