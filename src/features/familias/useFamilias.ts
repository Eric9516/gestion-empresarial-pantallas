import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';

export type Familia = Database['public']['Tables']['familias']['Row'];
export type Subfamilia = Database['public']['Tables']['subfamilias']['Row'];

// Se definen aparte para que quien necesite las familias (por ejemplo, la lista de repuestos) use las que ya están en memoria en vez de pedirlas otra vez.
export const opcionesFamilias = queryOptions({
  queryKey: ['familias'],
  queryFn: async () => {
    const { data, error } = await supabase.from('familias').select('*').order('nombre', { ascending: true });
    if (error) throw error;
    return data;
  },
});

export const opcionesSubfamilias = queryOptions({
  queryKey: ['subfamilias'],
  queryFn: async () => {
    const { data, error } = await supabase.from('subfamilias').select('*').order('nombre', { ascending: true });
    if (error) throw error;
    return data;
  },
});

export function useFamiliasQuery() {
  return useQuery(opcionesFamilias);
}

export function useSubfamiliasQuery() {
  return useQuery(opcionesSubfamilias);
}

export function useAddFamilia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ codigo, nombre }: { codigo: string; nombre: string }) => {
      const { data, error } = await supabase.from('familias').insert({ codigo, nombre }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['familias'] }); },
  });
}

export function useAddSubfamilia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ familia_id, codigo, nombre }: { familia_id: string; codigo: string; nombre: string }) => {
      const { data, error } = await supabase.from('subfamilias').insert({ familia_id, codigo, nombre }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['subfamilias'] }); },
  });
}

export function useRenameFamilia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase.from('familias').update({ nombre }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['familias'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useRenameSubfamilia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nombre }: { id: string; nombre: string }) => {
      const { error } = await supabase.from('subfamilias').update({ nombre }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subfamilias'] });
      void queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
