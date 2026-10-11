import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import type { Database } from '../../lib/database.types';

export type Tarea = Database['public']['Tables']['tasks']['Row'];
export type TareaHistorial = Database['public']['Tables']['task_history']['Row'];

const QUERY_KEY = ['tasks'] as const;

export function useTareasQuery() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: [...QUERY_KEY, profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useTareaHistorialQuery(taskId: string | null) {
  return useQuery({
    queryKey: ['task_history', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase.from('task_history').select('*').eq('task_id', taskId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// Al entrar a la pestaña, procesa automáticamente las tareas pendientes del
// usuario (arrastres, semáforo, detección de estancadas) — mismo RPC que la app vieja.
export function useProcesarTareasPendientes() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!profile) return;
      const { error } = await supabase.rpc('process_pending_tasks_for_user', { target_user_id: profile.id });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useCrearTarea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; description: string; traffic_level: string; assigned_date: string | null }) => {
      const { error } = await supabase.rpc('create_task', {
        p_title: input.title, p_description: input.description, p_traffic_level: input.traffic_level, p_assigned_date: input.assigned_date ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useEditarTarea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; title: string; description: string; traffic_level: string }) => {
      const { error } = await supabase.rpc('update_task', {
        p_task_id: input.taskId, p_title: input.title, p_description: input.description, p_traffic_level: input.traffic_level,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['task_history', vars.taskId] });
    },
  });
}

export function useCompletarTarea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.rpc('complete_task', { p_task_id: taskId });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useCancelarTarea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.rpc('cancel_task', { p_task_id: taskId });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}

export function useReprogramarTarea() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, fecha }: { taskId: string; fecha: string }) => {
      const { error } = await supabase.rpc('reprogram_task', { p_task_id: taskId, p_new_assigned_date: fecha });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: QUERY_KEY }); },
  });
}
