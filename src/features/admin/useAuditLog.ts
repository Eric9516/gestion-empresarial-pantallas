import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';

export type AuditLogRow = Database['public']['Tables']['audit_log']['Row'];

export function useAuditLogQuery() {
  return useQuery({
    queryKey: ['audit_log'],
    queryFn: async () => {
      const { data, error } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
}
