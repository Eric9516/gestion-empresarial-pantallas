import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';

export type ErrorLogRow = Database['public']['Tables']['error_logs']['Row'];

const QUERY_KEY = ['error_logs'] as const;

export function useErrorLogsQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
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
