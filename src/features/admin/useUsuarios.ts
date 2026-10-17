import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../lib/database.types';

// Cuando una Edge Function devuelve un error (ej. "no autorizado"), el cliente
// de Supabase lo entrega como FunctionsHttpError con el mensaje genérico
// "Edge Function returned a non-2xx status code" — el motivo real que arma la
// función (email repetido, no sos el dueño, etc.) queda en el cuerpo de la
// respuesta, no en error.message. Hay que leerlo aparte.
async function mensajeDeErrorDeFuncion(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const cuerpo = await error.context.json();
      if (cuerpo?.error) return cuerpo.error;
    } catch {
      // Si el cuerpo no es JSON legible, se cae al mensaje genérico de abajo.
    }
  }
  return error instanceof Error ? error.message : 'Error desconocido';
}

export type Usuario = Database['public']['Tables']['usuarios_perfil']['Row'];

export type UsuarioInput = {
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  mantenimiento_rol: string | null;
  puede_ver_retiros: boolean;
  puede_ver_errores: boolean;
  puede_resetear_contrasenas: boolean;
  puede_ver_sugerencias: boolean;
  puede_ajustar_inventario: boolean;
  puede_gestionar_depositos: boolean;
};

const QUERY_KEY = ['usuarios_perfil'] as const;

export function useUsuariosQuery() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios_perfil').select('*').order('nombre', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ input, password }: { input: UsuarioInput; password: string }) => {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { ...input, password },
      });
      if (error) throw new Error(await mensajeDeErrorDeFuncion(error));
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useUpdateUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UsuarioInput }) => {
      const { email: _email, ...body } = input;
      const { error } = await supabase.from('usuarios_perfil').update(body).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useToggleUsuarioActivo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('usuarios_perfil').update({ activo }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useDeleteUsuario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('delete-user', { body: { userId: id } });
      if (error) throw new Error(await mensajeDeErrorDeFuncion(error));
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

// Los dueños son varios y todos tienen los mismos poderes: agregar a uno no le
// quita el cargo a nadie, y el sistema nunca puede quedar sin ninguno.
export function useAgregarDueno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('agregar_dueno', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useQuitarDueno() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('quitar_dueno', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useResetPasswordUsuario() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke('reset-password', { body: { userId: id, password } });
      if (error) throw new Error(await mensajeDeErrorDeFuncion(error));
      if (data?.error) throw new Error(data.error);
    },
  });
}
