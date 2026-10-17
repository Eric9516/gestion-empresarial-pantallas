import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Json } from '../../lib/database.types';
import type { CampoCustom } from './useCamposCustom';

// Se define aparte para poder pedirla apenas hay sesión, sin esperar a que se dibuje la pantalla (ver AuthContext).
export const opcionesConfiguracion = queryOptions({
  queryKey: ['configuracion'],
  queryFn: async () => {
    const { data, error } = await supabase.from('configuracion').select('*').eq('id', 1).single();
    if (error) throw error;
    return data;
  },
});

export function useConfiguracionQuery() {
  return useQuery(opcionesConfiguracion);
}

export function useSaveConfiguracion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      empresa_nombre: string; empresa_direccion: string; empresa_telefono: string; empresa_email: string; logo_base64?: string;
      // Salen en los comprobantes (remitos, cargas de stock…)
      empresa_razon_social?: string; empresa_cuit?: string; empresa_web?: string;
      // null = volver a los colores originales de la app
      color_primario?: string | null; color_deposito?: string | null;
      zona_horaria?: string;
    }) => {
      const { error } = await supabase.from('configuracion').update(body).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      void queryClient.invalidateQueries({ queryKey: ['configuracion', 'comisionistas_campos_custom'] });
    },
  });
}

export function useSaveCamposCustom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campos: CampoCustom[]) => {
      const { error } = await supabase.from('configuracion').update({ comisionistas_campos_custom: campos as unknown as Json }).eq('id', 1);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuracion'] });
      void queryClient.invalidateQueries({ queryKey: ['configuracion', 'comisionistas_campos_custom'] });
    },
  });
}
