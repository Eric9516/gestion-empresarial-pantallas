import { nuevoId } from './almacenDemo';
import type { RepuestoLinea } from './tipos';

// Ayudas para las listas de repuestos (OT, rutina, historial). La pantalla está en RepuestosEditor.tsx.

/** "previsto": lo que va a hacer falta (OT abierta, rutina). "cierre": cuánto se usó de verdad (0 = no se cambió). */
export type ModoRepuestos = 'previsto' | 'cierre';

export function lineaNueva(modo: ModoRepuestos = 'previsto'): RepuestoLinea {
  return { id: nuevoId(), componente: '', codigo: '', descripcion: '', cantidad: modo === 'cierre' ? 0 : 1, usado: modo === 'cierre' ? 1 : null };
}

/** Saca los renglones vacíos (sin código ni descripción) y los espacios de más. */
export function limpiarLineas(lineas: RepuestoLinea[]): RepuestoLinea[] {
  return lineas
    .filter(l => l.codigo.trim() || l.descripcion.trim())
    .map(l => ({ ...l, componente: l.componente.trim(), codigo: l.codigo.trim(), descripcion: l.descripcion.trim() }));
}

/** Cantidad que cuenta para el stock en cada modo. */
export function cantidadDeLinea(l: RepuestoLinea, modo: ModoRepuestos) {
  return modo === 'cierre' ? (l.usado ?? l.cantidad) : l.cantidad;
}

/** Para terminar una OT: de entrada, se usó lo previsto. */
export function lineasParaCierre(lineas: RepuestoLinea[]): RepuestoLinea[] {
  return lineas.map(l => ({ ...l, usado: l.usado ?? l.cantidad }));
}
