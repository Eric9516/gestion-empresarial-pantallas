// Los tipos de retiros que usan las pantallas. Los datos los trae el servidor (app de Next).

export interface RetiroHistorialItem {
  id: string;
  /** El artículo que salió (para registrar su devolución). */
  item_id: string | null;
  cantidad: number;
  observacion: string | null;
  items: { codigo: string; descripcion: string } | null;
}

export interface RetiroHistorial {
  id: string;
  usuario_id: string;
  created_at: string;
  observacion_general: string | null;
  sectores: { nombre: string } | null;
  retiro_items: RetiroHistorialItem[];
}
