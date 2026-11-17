import { aFecha, aISO, sumarDias } from './fechas';
import type { EtapaOT, FechaISO, HorarioRecepcion, OrdenTrabajo, PasoOT, RolMantenimiento } from './tipos';

// El circuito de las órdenes de trabajo (del socio, 10/11/2026), sin pantallas ni base (por eso tiene pruebas):
// preventiva: el responsable la deriva → el jefe de taller la asigna → el técnico la hace y la termina → el jefe la revisa → el responsable la
// aprueba (recién ahí va al historial y descuenta repuestos). Correctiva: la carga el técnico después de hacer el trabajo (llamado de guardia)
// y sigue igual desde "revisar". Las terminadas les llegan al jefe y al responsable solo dentro del horario de recepción.
// Lo que vale de verdad lo controla la base (supabase/componentes/mantenimiento/…_circuito_de_las_ot_y_costos.sql); esto decide qué muestra la pantalla.

export const NOMBRE_ETAPA: Record<EtapaOT, string> = {
  por_derivar: 'Para derivar',
  por_asignar: 'Para asignar',
  asignada: 'Asignada',
  a_revisar: 'Para revisar',
  para_aprobar: 'Para aprobar',
  aprobada: 'Aprobada',
};

export const NOMBRE_ROL: Record<RolMantenimiento, string> = {
  responsable: 'Responsable de mantenimiento',
  jefe: 'Jefe de taller',
  tecnico: 'Técnico',
  consulta: 'Solo consulta',
};

/** El horario de fábrica: de lunes a viernes de 8:30 a 17 y los sábados de 8:30 a 12. */
export const HORARIO_DE_FABRICA: HorarioRecepcion = {
  dias: [1, 2, 3, 4, 5].map(dia => ({ dia, desde: '08:30', hasta: '17:00' })).concat({ dia: 6, desde: '08:30', hasta: '12:00' }),
};

/** "aaaa-mm-ddThh:mm" de un momento (hora local). */
export function aMomento(d: Date): string {
  return `${aISO(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "aaaa-mm-ddThh:mm" de ahora. */
export function ahora(): string {
  return aMomento(new Date());
}

/**
 * Cuándo le llega al jefe y al responsable una OT terminada en `terminadaEn`: en el momento si fue dentro del horario; si fue antes de que
 * empiece, a la hora de inicio de ese día; si fue después o en un día sin recepción, a la hora de inicio del próximo día con recepción.
 */
export function llegaEn(terminadaEn: string, h: HorarioRecepcion): string {
  const fecha = terminadaEn.slice(0, 10);
  const hora = terminadaEn.slice(11, 16) || '00:00';
  if (!h.dias.length) return terminadaEn;
  const franja = (f: FechaISO) => h.dias.find(d => d.dia === aFecha(f).getDay());
  const hoy = franja(fecha);
  if (hoy) {
    if (hora < hoy.desde) return `${fecha}T${hoy.desde}`;
    if (hora <= hoy.hasta) return terminadaEn;
  }
  for (let i = 1; i <= 7; i++) {
    const f = sumarDias(fecha, i);
    const fr = franja(f);
    if (fr) return `${f}T${fr.desde}`;
  }
  return terminadaEn;
}

/** Si una OT terminada ya les llegó (estaba dentro del horario o ya pasó su hora de llegada). */
export function yaLlego(ot: Pick<OrdenTrabajo, 'terminadaEn'>, momento: string, h: HorarioRecepcion): boolean {
  if (!ot.terminadaEn) return true;
  return llegaEn(ot.terminadaEn, h) <= momento;
}

/** Abierta = todavía no la terminó el técnico. */
export const estaAbierta = (o: Pick<OrdenTrabajo, 'estado'>) => o.estado !== 'terminada';

export const vencida = (o: Pick<OrdenTrabajo, 'estado' | 'fechaProgramada'>, hoy: FechaISO) => estaAbierta(o) && o.fechaProgramada < hoy;

export type ColorOT = 'verde' | 'amarillo' | 'rojo' | 'azul' | 'gris';

/**
 * El color de una OT en la lista, según quién la mira: verde = la tengo que mandar yo (responsable: derivar; jefe: asignar); amarillo =
 * pendiente o en curso; rojo = vencida; azul = terminada, para revisar o aprobar; gris = aprobada.
 */
export function colorDe(o: OrdenTrabajo, hoy: FechaISO, rol: RolMantenimiento): ColorOT {
  if (o.etapa === 'aprobada') return 'gris';
  if (!estaAbierta(o)) return 'azul';
  if (rol === 'responsable' && o.etapa === 'por_derivar') return 'verde';
  if (rol === 'jefe' && o.etapa === 'por_asignar') return 'verde';
  if (vencida(o, hoy)) return 'rojo';
  return 'amarillo';
}

/** Quien mira la lista: su usuario y su perfil. */
export interface Quien { id: string; rol: RolMantenimiento }

/**
 * Qué OT ve cada uno: el técnico, las que tiene asignadas; el jefe, todas menos las que el responsable todavía no derivó; el responsable y
 * quien solo consulta, todas. Las terminadas, recién cuando les llegan (horario de recepción).
 */
export function laVe(o: OrdenTrabajo, quien: Quien, momento: string, h: HorarioRecepcion): boolean {
  if (quien.rol === 'tecnico') return o.asignados.some(a => a.id === quien.id);
  if (quien.rol === 'jefe' && o.etapa === 'por_derivar') return false;
  if (!estaAbierta(o) && o.etapa !== 'aprobada' && quien.rol !== 'consulta') return yaLlego(o, momento, h);
  return true;
}

/** El último comentario con el que devolvieron la OT (si la devolvieron y todavía no la volvieron a terminar). */
export function devolucion(o: Pick<OrdenTrabajo, 'pasos' | 'etapa'>): PasoOT | null {
  if (o.etapa !== 'asignada') return null;
  const i = o.pasos.map(p => p.accion).lastIndexOf('Devolvió la OT al técnico');
  if (i < 0) return null;
  return o.pasos.slice(i + 1).some(p => p.accion.startsWith('Terminó')) ? null : o.pasos[i];
}

/** El momento para mostrar: "10/11 14:35". */
export function momentoCorto(m: string): string {
  const [f, h] = m.split('T');
  const [, mes, dia] = f.split('-');
  return `${dia}/${mes}${h ? ` ${h.slice(0, 5)}` : ''}`;
}

/** Lo que guarda la configuración (una lista de franjas) → el horario; vacío o raro = el de fábrica. */
export function horarioDe(v: unknown): HorarioRecepcion {
  if (!Array.isArray(v)) return HORARIO_DE_FABRICA;
  const hora = (x: unknown) => (typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : null);
  const dias = v.flatMap(d => {
    const x = d as { dia?: unknown; desde?: unknown; hasta?: unknown } | null;
    const desde = hora(x?.desde), hasta = hora(x?.hasta);
    return x && Number.isInteger(x.dia) && (x.dia as number) >= 0 && (x.dia as number) <= 6 && desde && hasta && desde < hasta
      ? [{ dia: x.dia as number, desde, hasta }] : [];
  });
  return { dias };
}

/** Lo que tiene que hacer cada uno ahora (el aviso verde y el número del menú): mandar (derivar o asignar), revisar o aprobar, y sus asignadas. */
export function pendientesDe(ordenes: Pick<OrdenTrabajo, 'etapa' | 'terminadaEn' | 'asignados'>[], quien: Quien, momento: string, h: HorarioRecepcion) {
  const llegaron = (o: Pick<OrdenTrabajo, 'terminadaEn'>) => yaLlego(o, momento, h);
  const asignadas = ordenes.filter(o => o.etapa === 'asignada' && o.asignados.some(a => a.id === quien.id)).length;
  if (quien.rol === 'responsable') {
    return { paraMandar: ordenes.filter(o => o.etapa === 'por_derivar').length, paraRevisar: ordenes.filter(o => o.etapa === 'para_aprobar' && llegaron(o)).length, asignadas };
  }
  if (quien.rol === 'jefe') {
    return { paraMandar: ordenes.filter(o => o.etapa === 'por_asignar').length, paraRevisar: ordenes.filter(o => o.etapa === 'a_revisar' && llegaron(o)).length, asignadas };
  }
  return { paraMandar: 0, paraRevisar: 0, asignadas: quien.rol === 'tecnico' ? asignadas : 0 };
}
