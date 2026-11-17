// Los tipos de admin que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';
import type { FotoSlot } from '../items/slotsDeFoto';

export type ErrorLogRow = Database['public']['Tables']['error_logs']['Row'];

export type FilaFotoPendiente = {
  item_id: string;
  slot: FotoSlot;
  codigo: string;
  descripcion: string;
  foto_url: string;
  subida_por: string | null;
  subida_at: string | null;
  quien: string;
};

export type FilaPapelera = {
  tipo: 'proveedor' | 'repuesto' | 'reparacion' | 'envio';
  id: string;
  titulo: string;
  eliminado_por: string | null;
  eliminado_at: string | null;
  quien: string;
};

type SugerenciaRow = Database['public']['Tables']['sugerencias']['Row'];

export interface Sugerencia extends SugerenciaRow {
  usuarioNombre: string;
}

/** Un depósito de la persona, con su rol ahí. */
export interface PermisoDeDeposito { deposito_id: string; rol: 'admin' | 'comun' }

export type Usuario = Database['public']['Tables']['usuarios_perfil']['Row'] & { depositos?: PermisoDeDeposito[] };

export type UsuarioInput = {
  nombre: string;
  apellido: string;
  email: string;
  rol: string;
  mantenimiento_rol: string | null;
  /** El rol en Mantenimiento (los equipos): admin, tecnico, consulta o null (sin acceso). */
  rol_equipos: string | null;
  puede_ver_retiros: boolean;
  puede_ver_errores: boolean;
  puede_resetear_contrasenas: boolean;
  puede_ver_sugerencias: boolean;
  puede_ajustar_inventario: boolean;
  puede_gestionar_depositos: boolean;
  puede_ver_auditoria: boolean;
  puede_ver_informe: boolean;
  puede_ver_calendario: boolean;
  /** Sus depósitos, cada uno con su rol (sin dato = no se tocan; los dueños no llevan lista). */
  depositos?: PermisoDeDeposito[];
};
