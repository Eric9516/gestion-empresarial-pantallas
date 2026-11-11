import { dentro, type Periodo } from './disponibilidad';
import type { Equipo, FechaISO, GastoExterno, Intervencion } from './tipos';

// Costos de un equipo (decisión del encargado, 06/11/2026):
// - Repuestos: lo que se usó en cada mantenimiento × el precio por unidad anotado al terminar la OT.
// - Mano de obra propia: horas de trabajo de cada mantenimiento × un valor de hora único para todos.
// - Servicios externos: gastos cargados a mano directo en el equipo.
// Del equipo principal se suman también sus sub-equipos (como en el historial).

export type TipoCosto = 'repuestos' | 'manoDeObra' | 'externo';

export interface LineaCosto {
  id: string;
  fecha: FechaISO;
  tipo: TipoCosto;
  /** Qué fue ("2 × Rodamiento 6204", "3 h de trabajo", "Service de 4000 h — Proveedor"). */
  concepto: string;
  /** Número de OT, si salió de una. */
  ot: string | null;
  /** Sub-equipo, si el costo es de uno (vacío = el propio equipo). */
  subEquipo: string;
  /** null = no se puede calcular (falta el precio o el valor de la hora). */
  monto: number | null;
  /** Solo gastos externos: el gasto, para poder borrarlo. */
  gastoId?: string;
}

export interface CostosEquipo {
  lineas: LineaCosto[];
  repuestos: number;
  manoDeObra: number;
  externos: number;
  total: number;
  horas: number;
  /** Repuestos usados sin precio anotado (no suman). */
  repuestosSinPrecio: number;
  /** Hay horas de trabajo pero no se cargó el valor de la hora. */
  faltaCostoHora: boolean;
}

function numero(n: number | null | undefined): number {
  return n != null && Number.isFinite(n) && n > 0 ? n : 0;
}

function cantidadUsada(l: { cantidad: number; usado: number | null }): number {
  return numero(l.usado ?? l.cantidad);
}

export function calcularCostos(
  equipo: Equipo,
  subEquipos: Equipo[],
  intervenciones: Intervencion[],
  gastos: GastoExterno[],
  costoHora: number | null,
  p: Periodo | null,
): CostosEquipo {
  const ids = new Set([equipo.id, ...subEquipos.map(s => s.id)]);
  const nombreSub = new Map(subEquipos.map(s => [s.id, `${s.codigo} — ${s.nombre}`]));
  const enPeriodo = (f: FechaISO) => !p || dentro(f, p);
  const lineas: LineaCosto[] = [];
  let repuestosSinPrecio = 0;
  let horas = 0;

  for (const i of intervenciones) {
    if (!ids.has(i.equipoId) || !enPeriodo(i.fecha)) continue;
    const sub = nombreSub.get(i.equipoId) ?? '';
    for (const r of i.repuestos) {
      const cant = cantidadUsada(r);
      if (!cant) continue;
      const tienePrecio = r.precio != null && Number.isFinite(r.precio) && r.precio >= 0;
      if (!tienePrecio) repuestosSinPrecio += 1;
      lineas.push({
        id: `${i.id}-${r.id}`, fecha: i.fecha, tipo: 'repuestos', ot: i.otNumero, subEquipo: sub,
        concepto: `${cant.toLocaleString('es-AR')} × ${r.descripcion || r.codigo}${r.componente ? ` (${r.componente})` : ''}`,
        monto: tienePrecio ? cant * r.precio! : null,
      });
    }
    const h = numero(i.horas);
    if (h) {
      horas += h;
      lineas.push({
        id: `${i.id}-mo`, fecha: i.fecha, tipo: 'manoDeObra', ot: i.otNumero, subEquipo: sub,
        concepto: `${h.toLocaleString('es-AR', { maximumFractionDigits: 2 })} h de trabajo (${i.tipo})`,
        monto: costoHora != null ? h * costoHora : null,
      });
    }
  }

  for (const g of gastos) {
    if (!ids.has(g.equipoId) || !enPeriodo(g.fecha)) continue;
    lineas.push({
      id: g.id, fecha: g.fecha, tipo: 'externo', ot: null, subEquipo: nombreSub.get(g.equipoId) ?? '', gastoId: g.id,
      concepto: [g.descripcion, g.proveedor].filter(Boolean).join(' — '), monto: numero(g.monto),
    });
  }

  lineas.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const total = (t: TipoCosto) => lineas.filter(l => l.tipo === t).reduce((s, l) => s + (l.monto ?? 0), 0);
  const repuestos = total('repuestos');
  const manoDeObra = total('manoDeObra');
  const externos = total('externo');
  return { lineas, repuestos, manoDeObra, externos, total: repuestos + manoDeObra + externos, horas, repuestosSinPrecio, faltaCostoHora: horas > 0 && costoHora == null };
}

/** "$ 245.000" (sin centavos si no hacen falta). */
export function textoPesos(n: number): string {
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
}

/** Lee un monto escrito a mano: "15000", "15.000", "15.000,50", "$ 15.000". null si no es un número válido. */
export function leerMonto(texto: string): number | null {
  const limpio = texto.replace(/[$\s]/g, '');
  if (!limpio) return null;
  // Con coma, la coma es el decimal y los puntos son de miles; sin coma, los puntos seguidos de 3 cifras son de miles.
  const normal = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(limpio) ? limpio.replace(/\./g, '') : limpio;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
