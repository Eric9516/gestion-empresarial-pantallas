import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';

export interface CampoCustom {
  id: string;
  label: string;
  tipo: 'text' | 'tel' | 'number' | 'email' | 'textarea';
}

// Definiciones de campos extra para Comisionistas (configurables por el admin
// desde el panel de Admin, Fase 4) — viven en la fila única (id=1) de configuracion.
export function useCamposCustomQuery() {
  return useQuery({
    queryKey: ['configuracion', 'comisionistas_campos_custom'],
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion').select('comisionistas_campos_custom').eq('id', 1).single();
      if (error) throw error;
      return (data?.comisionistas_campos_custom as CampoCustom[] | null) ?? [];
    },
  });
}
