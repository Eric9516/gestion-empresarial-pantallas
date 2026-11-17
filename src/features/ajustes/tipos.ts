// Los tipos de ajustes que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { ClaseMovimiento, TipoAjuste } from '../../lib/ajustes';

export interface AjusteLinea {
  id: string;
  tipo: TipoAjuste;
  cantidad: number;
  stock_antes: number | null;
  stock_despues: number | null;
  items: { codigo: string; descripcion: string; unidad: string } | null;
}

export interface Ajuste {
  id: string;
  created_at: string;
  usuario_id: string;
  clase: ClaseMovimiento;
  fecha: string;
  punto_venta: number;
  numero: number;
  referencia: string | null;
  observaciones: string | null;
  motivo: string;
  anulado: boolean;
  anulado_por: string | null;
  anulado_at: string | null;
  motivo_anulacion: string | null;
  ajuste_items: AjusteLinea[];
  usuarioNombre: string;
  anuladoPorNombre: string | null;
}

export interface FiltrosDeMovimientos { texto: string; filtro: string; desde: string; hasta: string }
