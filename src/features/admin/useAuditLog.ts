import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { finDelDiaISO, inicioDelDiaISO } from '../../lib/fechaHoy';
import { POR_PAGINA } from '../../lib/paginacion';
import type { Database } from '../../lib/database.types';

export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];

export interface FiltrosDeAuditoria { tabla: string; accion: string; desde: string; hasta: string }

// El historial de cambios, de a páginas (los más nuevos primero; el id crece con el tiempo, así que se pide "lo anterior al último id", que no se hace más lento con los años).
// Los filtros (tabla, acción y fechas) los hace la base con índices.
export function useAuditLogQuery(f: FiltrosDeAuditoria) {
  const q = useInfiniteQuery({
    queryKey: ['audit_log', f.tabla, f.accion, f.desde, f.hasta],
    initialPageParam: null as number | null,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }): Promise<AuditLogRow[]> => {
      let consulta = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(POR_PAGINA);
      if (pageParam !== null) consulta = consulta.lt('id', pageParam);
      if (f.tabla) consulta = consulta.eq('tabla', f.tabla);
      if (f.accion) consulta = consulta.eq('accion', f.accion);
      if (f.desde) consulta = consulta.gte('created_at', inicioDelDiaISO(f.desde));
      if (f.hasta) consulta = consulta.lte('created_at', finDelDiaISO(f.hasta));
      const { data, error } = await consulta;
      if (error) throw error;
      return data;
    },
    getNextPageParam: pagina => (pagina.length === POR_PAGINA ? pagina[pagina.length - 1].id : undefined),
  });
  const filas = useMemo(() => q.data?.pages.flat() ?? [], [q.data]);
  return { filas, isLoading: q.isLoading, isError: q.isError, hayMas: !!q.hasNextPage, cargandoMas: q.isFetchingNextPage, verMas: () => void q.fetchNextPage() };
}
