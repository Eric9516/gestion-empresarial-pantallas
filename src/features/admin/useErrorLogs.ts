import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { cursorSiguiente, despuesDelCursor, POR_PAGINA, type Cursor } from '../../lib/paginacion';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';

export type ErrorLogRow = Database['public']['Tables']['error_logs']['Row'];

const QUERY_KEY = ['error_logs'] as const;

// El log de errores, de a páginas (los más nuevos primero).
export function useErrorLogsQuery() {
  const q = useInfiniteQuery({
    queryKey: QUERY_KEY,
    initialPageParam: null as Cursor | null,
    queryFn: async ({ pageParam }): Promise<ErrorLogRow[]> => {
      let consulta = supabase.from('error_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(POR_PAGINA);
      const despues = despuesDelCursor(pageParam);
      if (despues) consulta = consulta.or(despues);
      const { data, error } = await consulta;
      if (error) throw error;
      return data;
    },
    getNextPageParam: pagina => cursorSiguiente(pagina),
  });
  const filas = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  return { filas, isLoading: q.isLoading, isError: q.isError, hayMas: !!q.hasNextPage, cargandoMas: q.isFetchingNextPage, verMas: () => void q.fetchNextPage() };
}

export function useLimpiarErrorLogs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('error_logs').delete().not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
