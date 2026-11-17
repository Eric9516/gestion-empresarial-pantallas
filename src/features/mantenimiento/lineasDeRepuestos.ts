import type { RepuestoLinea } from './tipos';

// Ayudas para las listas de repuestos de una OT o una rutina (la pantalla está en Repuestos.tsx: este archivo va aparte porque una
// pantalla solo exporta componentes).

export type ModoRepuestos = 'previsto' | 'cierre';

let siguiente = 0;
const idNuevo = () => `nuevo-${++siguiente}`;

export function lineaNueva(modo: ModoRepuestos = 'previsto'): RepuestoLinea {
  return { id: idNuevo(), componente: '', itemId: null, codigo: '', descripcion: '', cantidad: modo === 'cierre' ? 0 : 1, usado: modo === 'cierre' ? 1 : null };
}

/** Saca los renglones vacíos (sin repuesto ni descripción). */
export function limpiarLineas(lineas: RepuestoLinea[]): RepuestoLinea[] {
  return lineas.filter(l => l.itemId || l.codigo.trim() || l.descripcion.trim())
    .map(l => ({ ...l, componente: l.componente.trim(), codigo: l.codigo.trim(), descripcion: l.descripcion.trim() }));
}

/** Para terminar una OT: de entrada, se usó lo previsto. */
export function lineasParaCierre(lineas: RepuestoLinea[]): RepuestoLinea[] {
  return lineas.map(l => ({ ...l, usado: l.usado ?? l.cantidad }));
}
