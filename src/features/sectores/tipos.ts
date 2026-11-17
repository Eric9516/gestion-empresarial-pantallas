// Los tipos de sectores que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';

export type Sector = Database['public']['Tables']['sectores']['Row'];
