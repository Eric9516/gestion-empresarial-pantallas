import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Database, Json } from '../../lib/database.types';
import { DEFAULT_DESIGN, type RotuloCampos, type RotuloDesign } from '../../lib/rotuloDesign';

export type RotuloDiseno = Database['public']['Tables']['rotulo_disenos']['Row'];

const CONFIG_KEY = ['configuracion'] as const;
const DISENOS_KEY = ['rotulo_disenos'] as const;

export function useRotuloDisenosQuery() {
  return useQuery({
    queryKey: DISENOS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('rotulo_disenos').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveRotuloDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { rotulo_design: RotuloDesign; rotulo_pie: string; rotulo_campos: RotuloCampos }) => {
      const { error } = await supabase.from('configuracion').update({
        rotulo_design: body.rotulo_design as unknown as Json,
        rotulo_pie: body.rotulo_pie,
        rotulo_campos: body.rotulo_campos as unknown as Json,
      }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: CONFIG_KEY }); },
  });
}

export function useResetRotuloDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('configuracion').update({ rotulo_design: DEFAULT_DESIGN as unknown as Json }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: CONFIG_KEY }); },
  });
}

export function useGuardarComoModelo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { nombre: string; design: RotuloDesign; pie: string; campos: RotuloCampos }) => {
      const { error } = await supabase.from('rotulo_disenos').insert({
        nombre: body.nombre,
        design: body.design as unknown as Json,
        pie: body.pie,
        campos: body.campos as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: DISENOS_KEY }); },
  });
}

export function useUsarModeloRotulo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (modelo: RotuloDiseno) => {
      const { error } = await supabase.from('configuracion').update({
        rotulo_design: modelo.design, rotulo_pie: modelo.pie, rotulo_campos: modelo.campos, rotulo_diseno_id: modelo.id,
      }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: CONFIG_KEY }); },
  });
}

export function useEliminarModeloRotulo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('rotulo_disenos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: DISENOS_KEY }); },
  });
}
