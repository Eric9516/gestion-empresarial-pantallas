import { aFecha, aISO, sumarDias } from './fechas';
import type { EtapaOT, FechaISO, HorarioRecepcion, OrdenTrabajo, PasoOT, PersonaMantenimiento, RolMantenimiento } from './tipos';

// Circuito de las órdenes de trabajo (sin pantallas ni base, por eso tiene pruebas):
// preventiva: el responsable la deriva → el jefe de taller la asigna → el técnico la hace y la termina →
// el jefe la revisa → el responsable la aprueba (recién ahí va al historial y descuenta repuestos).
// correctiva: la carga el técnico después de hacer el trabajo (llamado de guardia) y sigue igual desde "revisar".
// Las terminadas les llegan al jefe y al responsable solo dentro del horario de recepción.

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
};

/** "aaaa-mm-ddThh:mm" de un momento (hora local). */
export function aMomento(d: Date): string {
  return `${aISO(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Cuándo le llega al jefe y al responsable una OT terminada en `terminadaEn`: en el momento si fue dentro del
 * horario; si fue antes de que empiece, a la hora de inicio de ese día; si fue después o en un día sin recepción,
 * a la hora de inicio del próximo día con recepción.
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

/** Si una OT terminada ya les llegó (está dentro del horario o ya pasó su hora de llegada). */
export function yaLlego(ot: Pick<OrdenTrabajo, 'terminadaEn'>, ahora: string, h: HorarioRecepcion): boolean {
  if (!ot.terminadaEn) return true;
  return llegaEn(ot.terminadaEn, h) <= ahora;
}

/** Abierta = todavía no la terminó el técnico. */
export const estaAbierta = (o: OrdenTrabajo) => o.estado !== 'terminada';

export const vencida = (o: OrdenTrabajo, hoy: FechaISO) => estaAbierta(o) && o.fechaProgramada < hoy;

export type ColorOT = 'verde' | 'amarillo' | 'rojo' | 'azul' | 'gris';

/**
 * Color de una OT en la lista, según quién la mira:
 * verde = la tengo que mandar yo (responsable: derivar; jefe: asignar); amarillo = pendiente o en curso;
 * rojo = vencida; azul = terminada, para revisar o aprobar; gris = aprobada.
 */
export function colorDe(o: OrdenTrabajo, hoy: FechaISO, rol: RolMantenimiento): ColorOT {
  if (o.etapa === 'aprobada') return 'gris';
  if (!estaAbierta(o)) return 'azul';
  if (vencida(o, hoy)) return 'rojo';
  if (rol === 'responsable' && o.etapa === 'por_derivar') return 'verde';
  if (rol === 'jefe' && o.etapa === 'por_asignar') return 'verde';
  return 'amarillo';
}

/**
 * Qué OT ve cada uno:
 * - responsable: todas (las que el técnico terminó, recién cuando le llegan);
 * - jefe: todas menos las que el responsable todavía no derivó;
 * - técnico: las que tiene asignadas y las correctivas que cargó él.
 */
export function laVe(o: OrdenTrabajo, persona: PersonaMantenimiento, ahora: string, h: HorarioRecepcion): boolean {
  if (persona.rol === 'tecnico') return o.asignados.includes(persona.id);
  if (persona.rol === 'jefe' && o.etapa === 'por_derivar') return false;
  if (!estaAbierta(o) && o.etapa !== 'aprobada') return yaLlego(o, ahora, h);
  return true;
}

/** Lo que tiene que hacer cada uno ahora (para los avisos y el número del menú). */
export function pendientesDe(ordenes: OrdenTrabajo[], persona: PersonaMantenimiento, ahora: string, h: HorarioRecepcion) {
  const llegaron = (o: OrdenTrabajo) => yaLlego(o, ahora, h);
  if (persona.rol === 'responsable') {
    return {
      paraMandar: ordenes.filter(o => o.etapa === 'por_derivar').length,
      paraRevisar: ordenes.filter(o => o.etapa === 'para_aprobar' && llegaron(o)).length,
      enEspera: ordenes.filter(o => (o.etapa === 'a_revisar' || o.etapa === 'para_aprobar') && !llegaron(o)).length,
    };
  }
  if (persona.rol === 'jefe') {
    return {
      paraMandar: ordenes.filter(o => o.etapa === 'por_asignar').length,
      paraRevisar: ordenes.filter(o => o.etapa === 'a_revisar' && llegaron(o)).length,
      enEspera: ordenes.filter(o => o.etapa === 'a_revisar' && !llegaron(o)).length,
    };
  }
  return { paraMandar: 0, paraRevisar: 0, enEspera: 0, asignadas: ordenes.filter(o => o.etapa === 'asignada' && o.asignados.includes(persona.id)).length };
}

export function paso(cuando: string, quien: PersonaMantenimiento | string, accion: string, comentario = ''): PasoOT {
  return { cuando, quien: typeof quien === 'string' ? quien : quien.nombre, accion, comentario };
}

/** El último comentario con el que devolvieron la OT (si la devolvieron y sigue abierta). */
export function devolucion(o: OrdenTrabajo): PasoOT | null {
  const ultimo = [...o.pasos].reverse().find(p => p.accion.startsWith('Devolvió'));
  if (!ultimo || o.etapa !== 'asignada') return null;
  // Si después de devolverla se volvió a terminar, ya no cuenta.
  const i = o.pasos.lastIndexOf(ultimo);
  return o.pasos.slice(i + 1).some(p => p.accion.startsWith('Terminó')) ? null : ultimo;
}

/** Nombre corto para mostrar el momento: "10/11 14:35". */
export function momentoCorto(m: string): string {
  const [f, h] = m.split('T');
  const [, mes, dia] = f.split('-');
  return `${dia}/${mes}${h ? ` ${h}` : ''}`;
}

/** "aaaa-mm-ddThh:mm" de ahora. */
export function ahora(): string {
  return aMomento(new Date());
}

/** "hh:mm" de ahora. */
export function horaDeAhora(): string {
  return ahora().slice(11, 16);
}
