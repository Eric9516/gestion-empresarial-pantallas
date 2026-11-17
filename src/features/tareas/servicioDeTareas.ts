import { createContext, useContext } from 'react';
import type { Tarea, TareaHistorial } from './tipos';

export interface TareaNueva { title: string; description: string; traffic_level: string; assigned_date: string | null }
export interface TareaEditada { taskId: string; title: string; description: string; traffic_level: string }

/**
 * Lo que las pantallas de Tareas leen y hacen. Lo pone cada app a su manera (Supabase en la de Vite, el servidor en la de Next) con
 * <ContextoDeTareas.Provider>, y las ventanas lo toman con useServicioDeTareas.
 */
export interface ServicioDeTareas {
  tareas: Tarea[] | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Cambia cada vez que se vuelven a leer las tareas (el historial de una tarea se vuelve a pedir con eso). */
  revision: number;
  /** Arrastres, semáforo y estancadas: lo procesa la base al entrar a la pestaña. */
  procesarPendientes: () => Promise<void>;
  historial: (taskId: string) => Promise<TareaHistorial[]>;
  crear: (t: TareaNueva) => Promise<void>;
  editar: (t: TareaEditada) => Promise<void>;
  completar: (taskId: string) => Promise<void>;
  cancelar: (taskId: string) => Promise<void>;
  reprogramar: (taskId: string, fecha: string) => Promise<void>;
}

export const ContextoDeTareas = createContext<ServicioDeTareas | null>(null);

export function useServicioDeTareas(): ServicioDeTareas {
  const s = useContext(ContextoDeTareas);
  if (!s) throw new Error('Las pantallas de Tareas van dentro de <ContextoDeTareas.Provider>');
  return s;
}
