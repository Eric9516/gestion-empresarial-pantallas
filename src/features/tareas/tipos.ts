// Los tipos de tareas que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';

export type Tarea = Database['public']['Tables']['tasks']['Row'];

export type TareaHistorial = Database['public']['Tables']['task_history']['Row'];
