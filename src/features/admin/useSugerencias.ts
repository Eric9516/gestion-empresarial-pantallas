import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { fetchUsuariosPorIds } from '../../lib/usuarios';
import type { Database } from '../../lib/database.types';

type SugerenciaRow = Database['public']['Tables']['sugerencias']['Row'];
export interface Sugerencia extends SugerenciaRow {
  usuarioNombre: string;
}

const QUERY_KEY = ['sugerencias'] as const;

export function useSugerenciasQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Sugerencia[]> => {
      const { data, error } = await supabase.from('sugerencias').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      const usuarios = await fetchUsuariosPorIds((data ?? []).map(s => s.usuario_id).filter((v): v is string => !!v));
      return (data ?? []).map(s => {
        const u = s.usuario_id ? usuarios[s.usuario_id] : null;
        return { ...s, usuarioNombre: u ? (`${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || '') : 'Desconocido' };
      });
    },
  });
}

export function useLimpiarSugerencias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sugerencias').delete().not('id', 'is', null);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useEnviarSugerencia() {
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (mensaje: string) => {
      if (!profile) throw new Error('Sesión no disponible');
      const { error } = await supabase.from('sugerencias').insert({ usuario_id: profile.id, mensaje });
      if (error) throw error;
    },
  });
}
