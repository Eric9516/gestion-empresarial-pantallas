import { diasEntre, sumarDias } from './fechas';
import type { Equipo, FechaISO, Intervencion } from './tipos';

// Disponibilidad de los equipos: de las horas del período (24 h por día), cuántas estuvo parado cada equipo.
// Por ahora solo cuentan las paradas por mantenimiento, que salen del historial: las horas de parada de los
// correctivos y las de los preventivos, por separado. Más adelante se suman las paradas por producción y por
// fin de producción (decisión del encargado, 06/11/2026).

export type PeriodoId = 'mes' | 'mesAnterior' | 'tresMeses' | 'anio';

export interface Periodo {
  desde: FechaISO;
  hasta: FechaISO;
}

export const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: 'mes', label: 'Este mes' },
  { id: 'mesAnterior', label: 'Mes pasado' },
  { id: 'tresMeses', label: 'Últimos 3 meses' },
  { id: 'anio', label: 'Este año' },
];

/** Fechas del período, contando hasta hoy (no se cuentan horas que todavía no pasaron). */
export function periodo(id: PeriodoId, hoy: FechaISO): Periodo {
  const [a, m] = hoy.split('-').map(Number);
  const primero = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}-01`;
  switch (id) {
    case 'mes': return { desde: primero(a, m), hasta: hoy };
    case 'mesAnterior': {
      const desde = m === 1 ? primero(a - 1, 12) : primero(a, m - 1);
      return { desde, hasta: sumarDias(primero(a, m), -1) };
    }
    case 'tresMeses': return { desde: sumarDias(hoy, -89), hasta: hoy };
    case 'anio': return { desde: `${a}-01-01`, hasta: hoy };
  }
}

/** Horas que tiene el período: 24 por día, contando los dos extremos. */
export function horasDelPeriodo(p: Periodo): number {
  return Math.max(0, diasEntre(p.desde, p.hasta) + 1) * 24;
}

export function dentro(fecha: FechaISO, p: Periodo): boolean {
  return fecha >= p.desde && fecha <= p.hasta;
}

/** Horas que el equipo estuvo parado por un registro del historial, separadas por tipo. */
export function horasParadaDe(i: Intervencion): { correctivo: number; preventivo: number } {
  const valor = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : 0);
  return i.tipo === 'correctivo'
    ? { correctivo: valor(i.correctivo?.horasParada), preventivo: 0 }
    : { correctivo: 0, preventivo: valor(i.horasParada) };
}

export interface FilaDisponibilidad {
  /** Horas que podría haber funcionado (24 h × días). */
  horas: number;
  paradaCorrectivo: number;
  paradaPreventivo: number;
  /** De 0 a 100. */
  disponibilidad: number;
}

export interface DisponibilidadEquipo extends FilaDisponibilidad {
  equipo: Equipo;
}

export interface DisponibilidadSector extends FilaDisponibilidad {
  sector: string;
  equipos: number;
}

export interface ResumenDisponibilidad {
  general: FilaDisponibilidad & { equipos: number };
  porSector: DisponibilidadSector[];
  /** Equipos que estuvieron parados, de más a menos horas. */
  equipos: DisponibilidadEquipo[];
}

function fila(horas: number, corr: number, prev: number): FilaDisponibilidad {
  // Las paradas no pueden pasar las horas del período (por si se anotó de más).
  const paradaCorrectivo = Math.min(corr, horas);
  const paradaPreventivo = Math.min(prev, horas - paradaCorrectivo);
  const disponibilidad = horas > 0 ? ((horas - paradaCorrectivo - paradaPreventivo) / horas) * 100 : 100;
  return { horas, paradaCorrectivo, paradaPreventivo, disponibilidad };
}

/**
 * Se mide cada equipo principal: si para un sub-equipo (por ejemplo, la bomba de un pasteurizador), se cuenta
 * como parada del equipo principal. Los sectores siguen el orden recibido (el de importancia de la empresa).
 */
export function calcularDisponibilidad(equipos: Equipo[], intervenciones: Intervencion[], p: Periodo, ordenSectores: string[] = []): ResumenDisponibilidad {
  const horas = horasDelPeriodo(p);
  const principales = equipos.filter(e => !e.padreId);
  const principalDe = new Map<string, string>();
  for (const e of equipos) principalDe.set(e.id, e.padreId ?? e.id);

  const parada = new Map<string, { corr: number; prev: number }>();
  for (const i of intervenciones) {
    if (!dentro(i.fecha, p)) continue;
    const id = principalDe.get(i.equipoId);
    if (!id) continue;
    const h = horasParadaDe(i);
    const actual = parada.get(id) ?? { corr: 0, prev: 0 };
    parada.set(id, { corr: actual.corr + h.correctivo, prev: actual.prev + h.preventivo });
  }

  const porEquipo: DisponibilidadEquipo[] = principales.map(e => {
    const x = parada.get(e.id) ?? { corr: 0, prev: 0 };
    return { equipo: e, ...fila(horas, x.corr, x.prev) };
  });

  const suma = (lista: DisponibilidadEquipo[]) => {
    const f = fila(horas * lista.length, lista.reduce((t, x) => t + x.paradaCorrectivo, 0), lista.reduce((t, x) => t + x.paradaPreventivo, 0));
    return f;
  };

  const sectores = new Map<string, DisponibilidadEquipo[]>();
  for (const x of porEquipo) {
    const s = x.equipo.sector.trim() || 'Sin sector';
    sectores.set(s, [...(sectores.get(s) ?? []), x]);
  }
  const clave = (s: string) => s.trim().toLowerCase();
  const pos = new Map(ordenSectores.map((s, i) => [clave(s), i]));
  const porSector = [...sectores.entries()]
    .map(([sector, lista]) => ({ sector, equipos: lista.length, ...suma(lista) }))
    .sort((a, b) => (pos.get(clave(a.sector)) ?? Infinity) - (pos.get(clave(b.sector)) ?? Infinity) || a.sector.localeCompare(b.sector, 'es'));

  return {
    general: { equipos: porEquipo.length, ...suma(porEquipo) },
    porSector,
    equipos: porEquipo
      .filter(x => x.paradaCorrectivo + x.paradaPreventivo > 0)
      .sort((a, b) => b.paradaCorrectivo + b.paradaPreventivo - (a.paradaCorrectivo + a.paradaPreventivo)),
  };
}

/** "97,8 %" (con una decimal; 100 % sin decimales). */
export function textoPorcentaje(n: number): string {
  if (n >= 99.95) return '100 %';
  return `${n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** "12 h", "3,5 h". */
export function textoHoras(n: number): string {
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`;
}
