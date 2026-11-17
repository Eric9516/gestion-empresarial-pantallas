// Los tipos de familias que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';

export type Familia = Database['public']['Tables']['familias']['Row'];

export type Subfamilia = Database['public']['Tables']['subfamilias']['Row'];
