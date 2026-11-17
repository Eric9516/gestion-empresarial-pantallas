'use server';
import { z } from 'zod';
import type { TareaEditada, TareaNueva } from '@/features/tareas/servicioDeTareas';
import type { Tarea, TareaHistorial } from '@/features/tareas/tipos';
import { comoUsuario } from '~/lib/db';
import { exigirUsuario } from '~/lib/sesion';
import { FechaONula, Fecha, Id, TextoONulo, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// Tareas: las mismas funciones de la base que usa la app de Vite. Cada persona ve y cambia solo las suyas (lo decide la base).
// Los registros se leen con to_jsonb: llegan igual que de Supabase (fechas como texto).

const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
const SEMAFOROS = ['green', 'yellow', 'red'];

// Lo que reciben las acciones (lo revisa entrada(): ver ~/lib/entrada)
const Comunes = { title: TextoONulo(500), description: TextoONulo(5000), traffic_level: TextoONulo(20) };
const Nueva = z.object({ ...Comunes, assigned_date: FechaONula });
const Editada = z.object({ ...Comunes, taskId: Id });
async function hacer(sql: string, valores: unknown[], porDefecto: string): Promise<{ error: string | null }> {
  const usuario = await exigirUsuario();
  try {
    await comoUsuario(usuario, c => c.query(sql, valores));
    return { error: null };
  } catch (e) {
    return { error: mensajeDe(e, porDefecto) };
  }
}

export async function misTareas(): Promise<Tarea[]> {
  const usuario = await entrada('misTareas');
  return comoUsuario(usuario, async c =>
    (await c.query<{ r: Tarea }>('select to_jsonb(t) as r from public.tasks t where t.user_id = auth.uid() order by t.created_at desc')).rows.map(x => x.r));
}

export async function historialDeTarea(taskId: string): Promise<TareaHistorial[]> {
  const usuario = await entrada('historialDeTarea', [Id], [taskId]);
  if (!esId(taskId)) return [];
  return comoUsuario(usuario, async c =>
    (await c.query<{ r: TareaHistorial }>('select to_jsonb(h) as r from public.task_history h where h.task_id = $1 order by h.created_at desc', [taskId])).rows.map(x => x.r));
}

export async function procesarPendientes() {
  await entrada('procesarPendientes');
  return hacer('select public.process_pending_tasks_for_user(auth.uid())', [], 'No se pudieron procesar las tareas pendientes');
}

export async function crearTarea(t: TareaNueva) {
  await entrada('crearTarea', [Nueva], [t]);
  if (!String(t.title ?? '').trim() || !SEMAFOROS.includes(t.traffic_level)) return { error: 'Completá el título' };
  return hacer('select public.create_task($1, $2, $3, $4)',
    [t.title.trim().slice(0, 200), String(t.description ?? '').trim().slice(0, 2000), t.traffic_level, t.assigned_date || null], 'No se pudo crear la tarea');
}

export async function editarTarea(t: TareaEditada) {
  await entrada('editarTarea', [Editada], [t]);
  if (!esId(t.taskId) || !String(t.title ?? '').trim() || !SEMAFOROS.includes(t.traffic_level)) return { error: 'Completá el título' };
  return hacer('select public.update_task($1, $2, $3, $4)',
    [t.taskId, t.title.trim().slice(0, 200), String(t.description ?? '').trim().slice(0, 2000), t.traffic_level], 'No se pudo guardar la tarea');
}

export async function completarTarea(taskId: string) {
  await entrada('completarTarea', [Id], [taskId]);
  if (!esId(taskId)) return { error: 'Tarea no válida' };
  return hacer('select public.complete_task($1)', [taskId], 'No se pudo completar la tarea');
}

export async function cancelarTarea(taskId: string) {
  await entrada('cancelarTarea', [Id], [taskId]);
  if (!esId(taskId)) return { error: 'Tarea no válida' };
  return hacer('select public.cancel_task($1)', [taskId], 'No se pudo cancelar la tarea');
}

export async function reprogramarTarea(taskId: string, fecha: string) {
  await entrada('reprogramarTarea', [Id, Fecha], [taskId, fecha]);
  if (!esId(taskId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: 'Elegí una fecha' };
  return hacer('select public.reprogram_task($1, $2::date)', [taskId, fecha], 'No se pudo reprogramar la tarea');
}
