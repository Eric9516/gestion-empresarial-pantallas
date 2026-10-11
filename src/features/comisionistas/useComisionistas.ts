import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import type { Database } from '../../lib/database.types';

export type Comisionista = Database['public']['Tables']['comisionistas']['Row'];
export type ComisionistaInput = {
  nombre: string;
  zona: string;
  empresa: string;
  telefono: string;
  celular: string;
  email: string;
  localidad: string;
  provincia: string;
  notas: string;
  activo: boolean;
  campos_extra: Record<string, string>;
};

const QUERY_KEY = ['comisionistas'] as const;

export function useComisionistasQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('comisionistas').select('*').order('nombre', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveComisionista() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string | null; data: ComisionistaInput }) => {
      const body = {
        ...data,
        modificado_por: profile?.nombre || profile?.email || 'Usuario',
        updated_at: new Date().toISOString(),
      };
      if (id) {
        const { error } = await supabase.from('comisionistas').update(body).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comisionistas').insert(body);
        if (error) throw error;
      }
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

// A diferencia de Proveedores, Comisionistas no tiene Papelera (fuera del
// alcance acordado en el plan) — sigue siendo un borrado directo, igual que hoy.
export function useDeleteComisionista() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comisionistas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
