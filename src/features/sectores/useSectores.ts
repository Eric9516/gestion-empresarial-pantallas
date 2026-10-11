import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';

export type Sector = Database['public']['Tables']['sectores']['Row'];

const QUERY_KEY = ['sectores'] as const;

export function useSectoresQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('sectores').select('*').order('nombre', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nombre: string) => {
      const { data, error } = await supabase.from('sectores').insert({ nombre }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useRenameSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase.from('sectores').update({ nombre }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useDeleteSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sectores').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useToggleSectorActivo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('sectores').update({ activo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
