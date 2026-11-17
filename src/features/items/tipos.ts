// Los tipos de items que usan las pantallas. Los datos los trae el servidor (app de Next).
import type { Proveedor } from '../proveedores/tipos';
import type { Database } from '../../lib/database.types';
import type { Familia, Subfamilia } from '../familias/tipos';

export type TipoDeMovimiento = 'carga' | 'ajuste' | 'retiro' | 'reparacion' | 'mantenimiento' | 'otro';

export interface MovimientoFila {
  id: number;
  created_at: string;
  tipo: TipoDeMovimiento;
  detalle: string;
  entrada: number;
  salida: number;
  // el stock que quedó después de este movimiento (vacío en los movimientos viejos, anteriores a llevar el saldo)
  existencia: number | null;
  comprobante: string | null;
  referencia: string | null;
  sector: string | null;
  motivo: string | null;
  usuarioNombre: string;
}

export type ProveedorDeItem = {
  id: string; // id del vínculo (item_proveedores.id)
  proveedor: Pick<Proveedor, 'id' | 'nombre' | 'rubro'>;
};

// Columnas que la lista de repuestos NO trae: datos de auditoría (quién y cuándo subió la foto o borró el repuesto) que solo hacen falta en la papelera y en
// fotos pendientes, que los piden por su cuenta. Con miles de repuestos, no mandarlos por cada fila achica bastante lo que se descarga al abrir la app.
type ColumnasFueraDeLaLista = 'eliminado_at' | 'eliminado_por' | 'foto_subida_at' | 'foto_subida_at_2' | 'foto_subida_at_3' | 'foto_subida_por' | 'foto_subida_por_2' | 'foto_subida_por_3' | 'estado_reposicion_at' | 'created_at' | 'updated_at';

export type Item = Omit<Database['public']['Tables']['items']['Row'], ColumnasFueraDeLaLista> & {
  familias: Pick<Familia, 'id' | 'codigo' | 'nombre'> | null;
  subfamilias: Pick<Subfamilia, 'id' | 'codigo' | 'nombre'> | null;
};

export type ItemInput = {
  familia_id: string;
  subfamilia_id: string;
  numero: string;
  descripcion: string;
  ubicacion: string;
  unidad: string;
  // Solo se usa al crear (entra como una "Carga inicial"); al editar, el stock no se escribe acá: cambia con un movimiento.
  stock: number | null;
  stock_minimo: number | null;
  punto_pedido: number | null;
  detalles: string;
  // Cómo llama la gente de planta al repuesto: cuenta en la búsqueda (tanto como el nombre) y no se muestra en la lista de resultados.
  palabras_clave: string;
};

// ---------------------------------------------------------------------------------------------------------------------------------------------
// El catálogo vive en el servidor: la aplicación nunca lo descarga entero. Se busca con la función buscar_repuestos (índices de texto en la base)
// y se piden de a pocos. Funciona igual con 5.000 repuestos que con 500.000.
// ---------------------------------------------------------------------------------------------------------------------------------------------

// Lo que devuelve una búsqueda: lo justo para mostrar la lista. El repuesto completo (fotos, estado, etc.) se pide al abrirlo.
export interface RepuestoDeLista {
  id: string;
  codigo: string;
  numero: string;
  descripcion: string;
  detalles: string | null;
  ubicacion: string | null;
  stock: number | null;
  stock_minimo: number;
  punto_pedido: number;
  familia_id: string;
  subfamilia_id: string;
  foto_url: string | null;
  puntaje: number;
}


// Lo que hay que reponer (stock mínimo cargado y stock en el punto de pedido o por debajo), ya filtrado y ordenado por urgencia en la base. Trae hasta `limite`
// y, además, cuántos cumplen en total (para avisar si hay más de los que se muestran) y cuántos están sin stock.
export interface RepuestoAReponer {
  id: string;
  codigo: string;
  numero: string;
  descripcion: string;
  detalles: string | null;
  stock: number | null;
  stock_minimo: number;
  punto_pedido: number;
  familia_id: string;
  subfamilia_id: string;
  estado_reposicion: string | null;
}

export interface InformeDeReposicion { filas: RepuestoAReponer[]; total: number; totalSinStock: number }

export interface FiltrosDeReposicion { texto?: string; familiaId?: string; estado?: string; limite?: number }
