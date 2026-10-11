import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { compressImage } from '../../lib/compressImage';
import { publicUrl } from '../../lib/storage';
import type { Database } from '../../lib/database.types';
import type { Familia, Subfamilia } from '../familias/useFamilias';
import type { EstadoReposicion } from './reposicion';

export type Item = Database['public']['Tables']['items']['Row'] & {
  familias: Pick<Familia, 'id' | 'codigo' | 'nombre'> | null;
  subfamilias: Pick<Subfamilia, 'id' | 'codigo' | 'nombre'> | null;
};

// Compacta el segmento numérico final (p.ej. "003" o "00003") a su valor sin
// ceros a la izquierda, para poder matchear "PU003" contra el código real
// "MVPPU00003" aunque el relleno de ceros no coincida en cantidad de dígitos.
function compactarDigitosFinales(texto: string): string {
  const m = /^(.*?)(\d+)$/.exec(texto);
  if (!m) return texto;
  const [, prefijo, digitos] = m;
  return prefijo + String(parseInt(digitos, 10));
}

type ItemBuscable = Pick<Item, 'codigo' | 'numero' | 'descripcion' | 'detalles'>;

// Palabras conectoras: aparecen en casi cualquier descripción ("rodamiento
// DE bronce", "junta DE goma"), así que matchean gratis en casi todo y no
// sirven para distinguir un repuesto de otro — se ignoran al puntuar.
const PALABRAS_CONECTORAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'a', 'un', 'una', 'unos', 'unas', 'para', 'con', 'sin', 'por']);

interface TerminoPreparado { texto: string; compacto: string }

// El catálogo tiene miles de repuestos: separar la búsqueda en palabras,
// sacar las conectoras y calcular la versión "sin ceros" de cada una es
// trabajo que solo depende de lo que se escribió, no de cada repuesto — por
// eso se hace UNA vez acá (prepararBusqueda) y no una vez POR repuesto,
// que es lo que hacía antes y volvía la búsqueda pesada con 5000+ filas.
export function prepararBusqueda(query: string): TerminoPreparado[] {
  const todos = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const significativos = todos.filter(t => !PALABRAS_CONECTORAS.has(t));
  const aUsar = significativos.length ? significativos : todos;
  return aUsar.map(texto => ({ texto, compacto: compactarDigitosFinales(texto) }));
}

function coincideUnTermino(it: ItemBuscable, termino: TerminoPreparado): boolean {
  if ([it.codigo, it.numero, it.descripcion, it.detalles].some(v => v?.toLowerCase().includes(termino.texto))) return true;
  const codigoCompacto = compactarDigitosFinales(it.codigo.toLowerCase());
  return codigoCompacto.includes(termino.compacto);
}

// La búsqueda no exige que TODAS las palabras coincidan — alguien puede
// buscar "ruptor de vacio RU006" y que la descripción real diga "rompedor"
// (o ni mencione "vacío"), pero el código sí matchea. Cada palabra suma un
// punto si aparece en algún lado (código, número, descripción o detalles);
// se usa para ordenar de más a menos relevante.
export function puntajeConBusquedaPreparada(it: ItemBuscable, terminos: TerminoPreparado[]): number {
  if (!terminos.length) return 1;
  return terminos.filter(t => coincideUnTermino(it, t)).length;
}

export function puntajeBusquedaItem(it: ItemBuscable, query: string): number {
  return puntajeConBusquedaPreparada(it, prepararBusqueda(query));
}

export function coincideBusquedaItem(it: ItemBuscable, query: string): boolean {
  return puntajeBusquedaItem(it, query) > 0;
}

export type ItemInput = {
  familia_id: string;
  subfamilia_id: string;
  numero: string;
  descripcion: string;
  ubicacion: string;
  stock: number | null;
  stock_minimo: number | null;
  punto_pedido: number | null;
  detalles: string;
};

const QUERY_KEY = ['items'] as const;

const PAGE_SIZE = 1000;

export function useItemsQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const all: Item[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('items')
          .select('*, familias(id,codigo,nombre), subfamilias(id,codigo,nombre)')
          .eq('activo', true)
          .order('codigo', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        all.push(...(data as Item[]));
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
  });
}

export function useSaveItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, input, familia, subfamilia,
    }: { id: string | null; input: ItemInput; familia: Familia; subfamilia: Subfamilia }) => {
      const numeroPad = input.numero.padStart(5, '0');
      const body = {
        codigo: `M${familia.codigo}${subfamilia.codigo}${numeroPad}`,
        numero: numeroPad,
        descripcion: input.descripcion,
        familia_id: input.familia_id,
        subfamilia_id: input.subfamilia_id,
        ubicacion: input.ubicacion || null,
        stock: input.stock,
        stock_minimo: input.stock_minimo ?? 0,
        punto_pedido: input.punto_pedido ?? 0,
        detalles: input.detalles || null,
      };
      if (id) {
        const { error } = await supabase.from('items').update(body).eq('id', id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from('items').insert(body).select().single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

// Marca (o desmarca, con null) el estado de reposición de varios repuestos.
// La fecha "desde cuándo" la pone la base; acá se vuelve a copiar a la lista
// en memoria en vez de recargar los 5.000 repuestos. Se manda en tandas
// porque los ids viajan en la URL.
const TANDA_IDS = 100;

export function useMarcarEstadoReposicion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, estado }: { ids: string[]; estado: EstadoReposicion | null }) => {
      const actualizados: Pick<Item, 'id' | 'estado_reposicion' | 'estado_reposicion_at'>[] = [];
      for (let i = 0; i < ids.length; i += TANDA_IDS) {
        const { data, error } = await supabase
          .from('items')
          .update({ estado_reposicion: estado })
          .in('id', ids.slice(i, i + TANDA_IDS))
          .select('id, estado_reposicion, estado_reposicion_at');
        if (error) throw error;
        actualizados.push(...data);
      }
      return actualizados;
    },
    onSuccess: actualizados => {
      const porId = new Map(actualizados.map(a => [a.id, a]));
      queryClient.setQueryData<Item[]>(QUERY_KEY, viejos => viejos?.map(it => {
        const nuevo = porId.get(it.id);
        return nuevo ? { ...it, estado_reposicion: nuevo.estado_reposicion, estado_reposicion_at: nuevo.estado_reposicion_at } : it;
      }));
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
