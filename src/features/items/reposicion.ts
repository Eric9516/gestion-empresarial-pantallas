import type { Item } from './useItems';

type ConReposicion = Pick<Item, 'stock' | 'stock_minimo' | 'punto_pedido'>;

// stock_minimo es la cantidad que se quiere tener y punto_pedido el aviso: al
// llegar a ese nivel (o bajar de él) hay que comprar, hasta volver al mínimo.
// stock_minimo en 0 = sin reposición configurada. Un punto_pedido en 0 es
// válido y significa "avisar recién al llegar a 0" (repuestos que se quiere
// tener de a 1, caros o de poca rotación).
export function necesitaReposicion(it: ConReposicion): boolean {
  return it.stock_minimo > 0 && (it.stock ?? 0) <= it.punto_pedido;
}

export function cantidadAComprar(it: ConReposicion): number {
  return Math.max(0, it.stock_minimo - (it.stock ?? 0));
}

// Seguimiento de lo que se está reponiendo. No existe "comprado": al llegar y
// actualizar el stock, el repuesto sale del informe y la base limpia el estado.
export type EstadoReposicion = 'presupuesto' | 'compras';

export const ETIQUETA_ESTADO: Record<EstadoReposicion, string> = {
  presupuesto: 'Pendiente de presupuesto',
  compras: 'Pasado a compras',
};

export function estadoDe(it: Pick<Item, 'estado_reposicion'>): EstadoReposicion | null {
  return it.estado_reposicion as EstadoReposicion | null;
}
