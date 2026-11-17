import { diasEntre, sumarDias } from './fechas';
import { HORARIO_DE_FABRICA } from './flujo';
import type { ConfigMantenimiento, FechaISO, Medicion, OrdenTrabajo, RepuestoLinea, Rutina, TareaDef, TrabajoTecnico } from './tipos';

// Lógica del preventivo que usan las pantallas, sin base de datos (del diseño del socio: su preventivo.ts). Armar la OT de cada rutina y
// terminarla lo hace la base (supabase/componentes/mantenimiento/…_preventivo_y_ordenes_de_trabajo.sql), con la misma regla:
// cada rutina activa tiene siempre una OT preventiva abierta para su próxima fecha; al terminarla, la rutina pasa a la fecha siguiente.

export type EstadoAviso = 'vencida' | 'por_vencer' | 'programada' | 'terminada';

/** Separa un texto en tareas: una por renglón, sin viñetas ni números al principio ("- ", "• ", "1. ", "2) ") ni renglones vacíos. */
export function listaDeTareas(texto: string): string[] {
  return texto.split(/\r?\n/)
    .map(l => l.trim().replace(/^(?:[-*•]+|\d+\s*[.)-])\s*/, '').trim())
    .filter(Boolean)
    .map(t => t.slice(0, 500));
}

export function numeroCorto(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

/** El formato de la OT mientras la empresa no elija otro (el mismo que pone la base). */
export const CONFIG_DE_FABRICA: ConfigMantenimiento = {
  registroCodigo: '', registroVersion: '', registroVigencia: '',
  controlesLiberacion: ['Sin objetos extraños', 'Limpieza', 'Sanitización', 'Prueba en vacío', 'Retiro de herramientas'],
  recibeLiberacion: 'Responsable de Producción',
  costoHora: null,
  horarioRecepcion: HORARIO_DE_FABRICA,
};

/** Si un valor anotado está fuera del rango normal de la medición. */
export function fueraDeRango(m: Medicion | null | undefined, valor: number | null | undefined): boolean {
  if (!m || valor == null) return false;
  return (m.minimo != null && valor < m.minimo) || (m.maximo != null && valor > m.maximo);
}

/** "normal 0 a 4,5 mm/s", "mín. 2 bar", "máx. 80 °C" o solo la unidad. */
export function textoRango(m: Medicion): string {
  const u = m.unidad ? ` ${m.unidad}` : '';
  if (m.minimo != null && m.maximo != null) return `normal ${numeroCorto(m.minimo)} a ${numeroCorto(m.maximo)}${u}`;
  if (m.minimo != null) return `mín. ${numeroCorto(m.minimo)}${u}`;
  if (m.maximo != null) return `máx. ${numeroCorto(m.maximo)}${u}`;
  return m.unidad;
}

/** Una tarea en una línea: "Medir vibración (normal 0 a 4,5 mm/s)". */
export function textoTareaDef(t: { texto: string; medicion: Medicion | null }): string {
  return t.medicion ? `${t.texto} (${textoRango(t.medicion) || 'anotar valor'})` : t.texto;
}

/** Lee un número escrito por una persona ("4,5", " 12 "); null si está vacío, NaN si no es un número. */
export function leerNumero(t: string): number | null {
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

/** Tareas escritas de corrido (una por renglón) como tareas sin medición. */
export const tareasDeTexto = (texto: string): TareaDef[] => listaDeTareas(texto).map(t => ({ texto: t, medicion: null }));

export function numeroOT(n: number): string {
  return `OT-${String(n).padStart(4, '0')}`;
}

/** Si la OT está vencida, por vencer (dentro de los días de aviso), solo programada o ya terminada. */
export function estadoAviso(ot: Pick<OrdenTrabajo, 'estado' | 'fechaProgramada' | 'avisoDias'>, hoy: FechaISO): EstadoAviso {
  if (ot.estado === 'terminada') return 'terminada';
  const faltan = diasEntre(hoy, ot.fechaProgramada);
  if (faltan < 0) return 'vencida';
  if (faltan <= ot.avisoDias) return 'por_vencer';
  return 'programada';
}

/** Cuántas OT abiertas están vencidas y cuántas por vencer (el aviso de arriba y el número del menú). */
export function resumenAvisos(ordenes: Pick<OrdenTrabajo, 'estado' | 'fechaProgramada' | 'avisoDias'>[], hoy: FechaISO) {
  let vencidas = 0;
  let porVencer = 0;
  for (const o of ordenes) {
    const e = estadoAviso(o, hoy);
    if (e === 'vencida') vencidas += 1;
    else if (e === 'por_vencer') porVencer += 1;
  }
  return { vencidas, porVencer };
}

/** Para listas: la primera tarea y cuántas más hay ("Engrasar rodamientos (+4 más)"). */
export function resumenTareas(tareas: { texto: string }[] | string[]): string {
  const t = tareas.map(x => (typeof x === 'string' ? x : x.texto));
  if (!t.length) return '';
  return t.length === 1 ? t[0] : `${t[0]} (+${t.length - 1} más)`;
}

/** "3/10 tareas" de una OT con varias tareas; vacío si tiene una sola. */
export function avanceTareas(ot: Pick<OrdenTrabajo, 'tareas'>): string {
  return ot.tareas.length > 1 ? `${ot.tareas.filter(t => t.hecha).length}/${ot.tareas.length} tareas` : '';
}

function aMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Horas hombre de un técnico (de inicio a término; si termina al día siguiente, se suma). null si falta una hora. */
export function horasDeTecnico(t: Pick<TrabajoTecnico, 'inicio' | 'fin'>): number | null {
  const a = aMinutos(t.inicio);
  const b = aMinutos(t.fin);
  if (a == null || b == null) return null;
  const min = b >= a ? b - a : b + 24 * 60 - a;
  return Math.round((min / 60) * 100) / 100;
}

/** Suma de horas hombre de todos los técnicos (null si ninguno tiene horario completo). */
export function totalHorasHombre(tecnicos: Pick<TrabajoTecnico, 'inicio' | 'fin'>[]): number | null {
  const horas = tecnicos.map(horasDeTecnico).filter((h): h is number => h != null);
  return horas.length ? Math.round(horas.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

/**
 * Las fechas futuras en que va a tocar una rutina dentro de [desde, hasta], SIN contar la próxima (esa ya tiene su OT). Sirven para
 * mostrar en el calendario lo que viene más adelante.
 */
export function proyectarFechas(rutina: Pick<Rutina, 'activa' | 'frecuenciaDias' | 'proximaFecha'>, desde: FechaISO, hasta: FechaISO, maximo = 60): FechaISO[] {
  if (!rutina.activa || rutina.frecuenciaDias < 1) return [];
  const fechas: FechaISO[] = [];
  let f = sumarDias(rutina.proximaFecha, rutina.frecuenciaDias);
  while (diasEntre(f, hasta) >= 0 && fechas.length < maximo) {
    if (diasEntre(desde, f) >= 0) fechas.push(f);
    f = sumarDias(f, rutina.frecuenciaDias);
  }
  return fechas;
}

/** "Motor: 2 × YAR 206 Rodamiento; Sello: 1 × S35" para textos cortos (PDF). */
export function textoRepuestos(lineas: Pick<RepuestoLinea, 'componente' | 'codigo' | 'descripcion' | 'cantidad'>[]): string {
  return lineas.map(r => `${r.componente ? `${r.componente}: ` : ''}${r.cantidad} × ${[r.codigo, r.descripcion].filter(Boolean).join(' ')}`).join('; ');
}

/**
 * Qué renglones de repuestos no tienen stock suficiente en el Depósito (si el mismo repuesto está en varios renglones, el stock tiene que
 * alcanzar para todos juntos). Los escritos a mano no cuentan: no descuentan stock.
 */
export function faltantes(lineas: RepuestoLinea[], cantidadDe: (l: RepuestoLinea) => number = l => l.cantidad): RepuestoLinea[] {
  const total = new Map<string, number>();
  for (const l of lineas) if (l.itemId) total.set(l.itemId, (total.get(l.itemId) ?? 0) + cantidadDe(l));
  return lineas.filter(l => l.itemId && l.stock != null && (total.get(l.itemId) ?? 0) > (l.stock ?? 0));
}
