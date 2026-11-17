// Los tipos de rotulos que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';

export type RotuloDiseno = Database['public']['Tables']['rotulo_disenos']['Row'];

export type RotuloGenerado = Database['public']['Tables']['rotulos_generados']['Row'];

export type RotuloBulto = Database['public']['Tables']['rotulos_bultos']['Row'];

export type RotuloFoto = Database['public']['Tables']['rotulos_fotos']['Row'];
