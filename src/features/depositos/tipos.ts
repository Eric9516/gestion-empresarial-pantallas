// Los tipos de depositos que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';

/** `motivo_no_borrar`: por qué no se puede borrar (null = se puede; lo dice la base). */
export type Deposito = Database['public']['Tables']['depositos']['Row'] & { motivo_no_borrar?: string | null };

// usa_retiros / usa_reparaciones: cómo trabaja el depósito; lo decide Compras (ver …_como_trabaja_cada_deposito.sql)
export interface DatosDeposito { nombre: string; color: string | null; icono: string; usa_retiros: boolean; usa_reparaciones: boolean }
