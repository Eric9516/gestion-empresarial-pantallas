import type { ReparacionConDetalle, ReparacionItemConDetalle } from './tipos';

// Cuánto volvió, cuánto falta y en qué estado está cada línea y cada reparación. Aparte de useReparaciones (que habla con la base) para usarlo
// en cualquier pantalla, también en la app de Next.

/** Qué se mandó en la línea: el repuesto del depósito (código y descripción) o, si no está en el depósito, el texto que se escribió. */
export function queSeMando(linea: Pick<ReparacionItemConDetalle, 'items' | 'descripcion'>): { codigo: string | null; texto: string } {
  return linea.items ? { codigo: linea.items.codigo, texto: linea.items.descripcion } : { codigo: null, texto: linea.descripcion ?? '' };
}

/** La misma línea en una sola tira de texto (para un aviso o un título). */
export const queSeMandoEnTexto = (linea: Pick<ReparacionItemConDetalle, 'items' | 'descripcion'>) => {
  const { codigo, texto } = queSeMando(linea);
  return codigo ? `${codigo} — ${texto}` : texto;
};

export function cantidadDevuelta(linea: Pick<ReparacionItemConDetalle, 'reparacion_entregas'>): number {
  return linea.reparacion_entregas.reduce((acc, e) => acc + Number(e.cantidad_devuelta), 0);
}

export function cantidadPendiente(linea: Pick<ReparacionItemConDetalle, 'cantidad' | 'reparacion_entregas'>): number {
  return Number(linea.cantidad) - cantidadDevuelta(linea);
}

// Estado de una línea: si algo se dio de baja sin reponerse, igual cuenta
// como "resuelta" — lo que importa es si queda algo afuera, no el resultado.
export type EstadoLinea = 'pendiente' | 'parcial' | 'cerrada';
export function estadoLinea(linea: Pick<ReparacionItemConDetalle, 'cantidad' | 'reparacion_entregas'>): EstadoLinea {
  const devuelta = cantidadDevuelta(linea);
  if (devuelta <= 0) return 'pendiente';
  if (devuelta < Number(linea.cantidad)) return 'parcial';
  return 'cerrada';
}

export type EstadoReparacion = 'pendiente' | 'parcial' | 'cerrada';
export function estadoReparacion(rep: Pick<ReparacionConDetalle, 'reparacion_items'>): EstadoReparacion {
  const estados = rep.reparacion_items.map(estadoLinea);
  if (estados.every(e => e === 'cerrada')) return 'cerrada';
  if (estados.every(e => e === 'pendiente')) return 'pendiente';
  return 'parcial';
}
