import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';

type TablaContable = 'sectores' | 'familias' | 'items' | 'usuarios_perfil';

async function contar(tabla: TablaContable): Promise<number> {
  const { count, error } = await supabase.from(tabla).select('*', { count: 'exact', head: true });
  return error ? 0 : (count ?? 0);
}

// Cuánto hay cargado de cada cosa, para marcar qué pasos del asistente ya están hechos.
// (Una tabla de un módulo apagado cuenta 0: el asistente tampoco muestra ese paso.)
export function useConteosIniciales() {
  return useQuery({
    queryKey: ['conteos-iniciales'],
    queryFn: async () => ({
      sectores: await contar('sectores'),
      familias: await contar('familias'),
      repuestos: await contar('items'),
      usuarios: await contar('usuarios_perfil'),
    }),
    staleTime: 0,
    // Mientras el asistente está abierto se cuenta cada pocos segundos: así un paso se marca como
    // hecho apenas se carga algo, sin tener que cambiar de pantalla.
    refetchInterval: 4000,
  });
}

// Cierra el asistente (porque se terminó o porque se lo saltó): deja de abrirse solo.
export function useCerrarConfiguracionInicial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const ahora = new Date().toISOString();
      const { error } = await supabase.from('configuracion').update({ inicial_cerrada_at: ahora }).eq('id', 1);
      if (error) throw error;
      return ahora;
    },
    onSuccess: ahora => {
      // Se actualiza el dato local de inmediato (antes de volver a pedirlo): si no, la "puerta" que abre el
      // asistente todavía vería "sin cerrar" y devolvería a la persona a Configuración.
      queryClient.setQueryData(['configuracion'], (previo: Record<string, unknown> | undefined) => (previo ? { ...previo, inicial_cerrada_at: ahora } : previo));
      void queryClient.invalidateQueries({ queryKey: ['configuracion'] });
    },
  });
}
