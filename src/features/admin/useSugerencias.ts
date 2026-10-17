import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { cursorSiguiente, despuesDelCursor, POR_PAGINA, type Cursor } from '../../lib/paginacion';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { fetchUsuariosPorIds } from '../../lib/usuarios';
import type { Database } from '../../lib/database.types';

type SugerenciaRow = Database['public']['Tables']['sugerencias']['Row'];
export interface Sugerencia extends SugerenciaRow {
  usuarioNombre: string;
}

const QUERY_KEY = ['sugerencias'] as const;

// Las sugerencias, de a páginas (las más nuevas primero).
export function useSugerenciasQuery() {
  const q = useInfiniteQuery({
    queryKey: QUERY_KEY,
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }): Promise<Sugerencia[]> => {
      let consulta = supabase.from('sugerencias').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(POR_PAGINA);
      const despues = despuesDelCursor(pageParam);
      if (despues) consulta = consulta.or(despues);
      const { data, error } = await consulta;
      if (error) throw error;
      const usuarios = await fetchUsuariosPorIds((data ?? []).map(s => s.usuario_id).filter((v): v is string => !!v));
      return (data ?? []).map(s => {
        const u = s.usuario_id ? usuarios[s.usuario_id] : null;
        return { ...s, usuarioNombre: u ? (`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || '') : 'Desconocido' };
      });
    },
    getNextPageParam: pagina => cursorSiguiente(pagina),
  });
  const filas = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  return { filas, isLoading: q.isLoading, isError: q.isError, hayMas: !!q.hasNextPage, cargandoMas: q.isFetchingNextPage, verMas: () => void q.fetchNextPage() };
}

export function useLimpiarSugerencias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sugerencias').delete().not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useEnviarSugerencia() {
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (mensaje: string) => {
      if (!profile) throw new Error('Sesión no disponible');
      const { error } = await supabase.from('sugerencias').insert({ usuario_id: profile.id, mensaje });
      if (error) throw error;
    },
  });
}
