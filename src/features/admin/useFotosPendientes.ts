import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';
import { fetchUsuariosPorIds, nombreUsuario } from '../../lib/usuarios';
import { CAMPOS_POR_SLOT, SLOTS_FOTO, type FotoSlot } from '../items/useItems';

export type FilaFotoPendiente = {
  item_id: string;
  slot: FotoSlot;
  codigo: string;
  descripcion: string;
  foto_url: string;
  subida_por: string | null;
  subida_at: string | null;
  quien: string;
};

const QUERY_KEY = ['fotos-pendientes'] as const;

const COLUMNAS = 'id,codigo,descripcion,' + SLOTS_FOTO.flatMap(s => [s, CAMPOS_POR_SLOT[s].pendiente, CAMPOS_POR_SLOT[s].subidaPor, CAMPOS_POR_SLOT[s].subidaAt]).join(',');
const FILTRO_PENDIENTES = SLOTS_FOTO.map(s => `${CAMPOS_POR_SLOT[s].pendiente}.eq.true`).join(',');

export function useFotosPendientesQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('items').select(COLUMNAS).or(FILTRO_PENDIENTES);
      if (error) throw error;
      const filas_db = data as unknown as Record<string, string | boolean | null>[];

      const idsUsuarios = filas_db.flatMap(it => SLOTS_FOTO.map(s => it[CAMPOS_POR_SLOT[s].subidaPor])).filter((v): v is string => typeof v === 'string');
      const usuarios = await fetchUsuariosPorIds(idsUsuarios);

      const filas: FilaFotoPendiente[] = [];
      for (const it of filas_db) {
        for (const slot of SLOTS_FOTO) {
          const campos = CAMPOS_POR_SLOT[slot];
          const fotoUrl = it[slot];
          const subidaPor = it[campos.subidaPor];
          if (it[campos.pendiente] && typeof fotoUrl === 'string') {
            filas.push({
              item_id: it.id as string, slot, codigo: it.codigo as string, descripcion: it.descripcion as string, foto_url: fotoUrl,
              subida_por: typeof subidaPor === 'string' ? subidaPor : null,
              subida_at: it[campos.subidaAt] as string | null,
              quien: nombreUsuario(typeof subidaPor === 'string' ? usuarios[subidaPor] : null),
            });
          }
        }
      }
      return filas.sort((a, b) => new Date(b.subida_at ?? 0).getTime() - new Date(a.subida_at ?? 0).getTime());
    },
  });
}

type ItemsUpdate = Database['public']['Tables']['items']['Update'];

function bodyLimpiarPendiente(slot: FotoSlot, borrarFoto: boolean): ItemsUpdate {
  switch (slot) {
    case 'foto_url': return { ...(borrarFoto && { foto_url: null }), foto_pendiente: false, foto_subida_por: null, foto_subida_at: null };
    case 'foto_url_2': return { ...(borrarFoto && { foto_url_2: null }), foto_pendiente_2: false, foto_subida_por_2: null, foto_subida_at_2: null };
    case 'foto_url_3': return { ...(borrarFoto && { foto_url_3: null }), foto_pendiente_3: false, foto_subida_por_3: null, foto_subida_at_3: null };
  }
}

// Aprobar: solo saca la marca de pendiente, la foto ya estaba visible desde
// que se subió — no hay nada más que "confirmar".
export function useAprobarFotoPendiente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item_id, slot }: { item_id: string; slot: FotoSlot }) => {
      const { error } = await supabase.from('items').update(bodyLimpiarPendiente(slot, false)).eq('id', item_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

// Rechazar: borra la foto (y de paso el archivo del bucket) — reutiliza la
// misma lógica de useDeleteItemFoto en vez de duplicarla.
export function useRechazarFotoPendiente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ item_id, slot, fotoUrl }: { item_id: string; slot: FotoSlot; fotoUrl: string }) => {
      const marker = '/storage/v1/object/public/items/';
      const idx = fotoUrl.indexOf(marker);
      if (idx !== -1) {
        await supabase.storage.from('items').remove([fotoUrl.slice(idx + marker.length)]).catch(() => {});
      }
      const { error } = await supabase.from('items').update(bodyLimpiarPendiente(slot, true)).eq('id', item_id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
