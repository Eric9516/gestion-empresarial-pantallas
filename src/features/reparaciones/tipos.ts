// Los tipos de reparaciones que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Database } from '../../lib/database.types';
import type { Item } from '../items/tipos';
import type { Proveedor } from '../proveedores/tipos';

export type Reparacion = Database['public']['Tables']['reparaciones']['Row'];

export type ReparacionItem = Database['public']['Tables']['reparacion_items']['Row'];

export type ReparacionEntrega = Database['public']['Tables']['reparacion_entregas']['Row'];

export type ReparacionItemConDetalle = ReparacionItem & {
  items: Pick<Item, 'id' | 'codigo' | 'descripcion'> | null;
  reparacion_entregas: ReparacionEntrega[];
};

export type ReparacionConDetalle = Reparacion & {
  proveedores: Pick<Proveedor, 'id' | 'nombre'> | null;
  rotulos_generados: { numero_documento: string | null } | null;
  reparacion_items: ReparacionItemConDetalle[];
};

export interface NuevaReparacionInput {
  proveedor_id: string;
  motivo: string;
  fecha_salida: string;
  envio_id: string | null;
  /** Cada línea es un repuesto del depósito (item_id) o algo que no está en el depósito (descripcion, sin stock que mover). */
  items: { item_id: string | null; descripcion?: string | null; cantidad: number; descuenta_stock: boolean }[];
}

export interface EditarReparacionInput {
  id: string;
  proveedor_id: string;
  motivo: string;
  fecha_salida: string;
  envio_id: string | null;
  orden_compra_numero: string | null;
  orden_compra_fecha: string | null;
}

export interface RegistrarEntregaInput {
  reparacion_item_id: string;
  cantidad_devuelta: number;
  resultado: 'reparado' | 'baja';
  remito_punto_venta: string | null;
  remito_numero: string | null;
  remito_fecha: string | null;
  fecha_entrega: string;
  registrado_por: string;
  repone_stock: boolean;
}
