import { diasEntre, sumarDias } from './fechas';
import type { ConfigMantenimiento, ConsumoStock, DetalleCorrectivo, Liberacion, TrabajoTecnico, FechaISO, Intervencion, Medicion, OrdenTrabajo, PlanillaTareas, RepuestoLinea, RutinaPreventiva } from './tipos';

// Lógica del mantenimiento preventivo, sin pantallas ni base de datos (por eso tiene pruebas).
// Regla: cada rutina activa tiene SIEMPRE una orden de trabajo (OT) preventiva abierta para su
// próxima fecha. Ese es el "aviso". Al terminar la OT se anota en el historial del equipo, la
// rutina pasa a la fecha siguiente y se genera la OT nueva.

export type EstadoAviso = 'vencida' | 'por_vencer' | 'programada' | 'terminada';

/**
 * Separa el texto de tareas en una lista: una tarea por renglón. Saca viñetas y números del
 * principio ("- ", "• ", "1. ", "2) ") y los renglones vacíos.
 */
export function listaDeTareas(texto: string): string[] {
  return texto.split(/\r?\n/)
    .map(l => l.trim().replace(/^(?:[-*\u2022]+|\d+\s*[.)-])\s*/, '').trim())
    .filter(Boolean);
}

/** Las marcas de "hecha" de una OT, siempre del mismo largo que su lista de tareas. */
export function marcasDe(ot: Pick<OrdenTrabajo, 'tareas' | 'tareasHechas'>): boolean[] {
  return listaDeTareas(ot.tareas).map((_, i) => ot.tareasHechas?.[i] === true);
}

/** Las mediciones de una OT o rutina, una por tarea (null = la tarea solo se tilda). */
export function medicionesDe(x: { tareas?: string; tarea?: string; mediciones?: (Medicion | null)[] }): (Medicion | null)[] {
  return listaDeTareas(x.tareas ?? x.tarea ?? '').map((_, i) => x.mediciones?.[i] ?? null);
}

/** Los valores anotados en una OT, uno por tarea (null = sin anotar). */
export function valoresDe(ot: Pick<OrdenTrabajo, 'tareas' | 'valores'>): (number | null)[] {
  return listaDeTareas(ot.tareas).map((_, i) => {
    const v = ot.valores?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  });
}

/** Si un valor anotado está fuera del rango normal de la medición. */
export function fueraDeRango(m: Medicion | null | undefined, valor: number | null | undefined): boolean {
  if (!m || valor == null) return false;
  return (m.minimo != null && valor < m.minimo) || (m.maximo != null && valor > m.maximo);
}

export function numeroCorto(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 3 });
}

/** "normal 0 a 4,5 mm/s", "mín. 2 bar", "máx. 80 °C" o solo la unidad. */
export function textoRango(m: Medicion): string {
  const u = m.unidad ? ` ${m.unidad}` : '';
  if (m.minimo != null && m.maximo != null) return `normal ${numeroCorto(m.minimo)} a ${numeroCorto(m.maximo)}${u}`;
  if (m.minimo != null) return `mín. ${numeroCorto(m.minimo)}${u}`;
  if (m.maximo != null) return `máx. ${numeroCorto(m.maximo)}${u}`;
  return m.unidad;
}

/** Las tareas de una planilla como las guarda una rutina: texto (una por renglón) y mediciones. */
export function tareasDePlanilla(p: Pick<PlanillaTareas, 'tareas'>): { tarea: string; mediciones: (Medicion | null)[] } {
  const tareas = p.tareas.map(t => ({ ...t, texto: t.texto.replace(/\s+/g, ' ').trim() })).filter(t => t.texto);
  return { tarea: tareas.map(t => t.texto).join('\n'), mediciones: tareas.map(t => t.medicion) };
}

/**
 * Las rutinas que usan una planilla toman de ella sus tareas y mediciones (así, cambiar la planilla
 * cambia todas). Devuelve la misma lista si no hubo cambios.
 */
export function aplicarPlanillas(rutinas: RutinaPreventiva[], planillas: PlanillaTareas[]): RutinaPreventiva[] {
  const porId = new Map(planillas.map(p => [p.id, p]));
  let cambio = false;
  const res = rutinas.map(r => {
    const p = r.planillaId ? porId.get(r.planillaId) : undefined;
    if (!p) return r;
    const t = tareasDePlanilla(p);
    if (t.tarea === r.tarea && JSON.stringify(t.mediciones) === JSON.stringify(medicionesDe(r))) return r;
    cambio = true;
    return { ...r, ...t };
  });
  return cambio ? res : rutinas;
}

/** Opciones de fábrica: sin código de registro y con los controles de entrega más comunes. */
export function configInicial(): ConfigMantenimiento {
  return {
    registroCodigo: '', registroVersion: '', registroVigencia: '',
    controlesLiberacion: ['Sin objetos extraños', 'Limpieza', 'Sanitización', 'Prueba en vacío', 'Retiro de herramientas'],
    recibeLiberacion: 'Responsable de Producción',
  };
}

function aMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
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
export function totalHorasHombre(tecnicos: TrabajoTecnico[]): number | null {
  const horas = tecnicos.map(horasDeTecnico).filter((h): h is number => h != null);
  return horas.length ? Math.round(horas.reduce((a, b) => a + b, 0) * 100) / 100 : null;
}

/** La liberación vacía, con los controles que eligió la empresa (null si no usa liberación). */
export function liberacionInicial(config: ConfigMantenimiento): Liberacion | null {
  return config.controlesLiberacion.length ? { controles: config.controlesLiberacion.map(texto => ({ texto, ok: false })), recibio: '' } : null;
}

/** Para listas: la primera tarea y cuántas más hay ("Engrasar rodamientos (+4 más)"). */
export function resumenTareas(texto: string): string {
  const t = listaDeTareas(texto);
  if (!t.length) return '';
  return t.length === 1 ? t[0] : `${t[0]} (+${t.length - 1} más)`;
}

/** "3/10" de una OT con varias tareas; vacío si tiene una sola. */
export function avanceTareas(ot: Pick<OrdenTrabajo, 'tareas' | 'tareasHechas'>): string {
  const m = marcasDe(ot);
  return m.length > 1 ? `${m.filter(Boolean).length}/${m.length} tareas` : '';
}

export function numeroOT(n: number): string {
  return `OT-${String(n).padStart(4, '0')}`;
}

/** El número más alto usado hasta ahora (OT-0012 → 12). */
export function ultimoNumeroOT(ordenes: OrdenTrabajo[]): number {
  return ordenes.reduce((max, o) => {
    const n = Number(/(\d+)$/.exec(o.numero)?.[1] ?? 0);
    return n > max ? n : max;
  }, 0);
}

/** Si la OT está vencida, por vencer (dentro del aviso), solo programada o ya terminada. */
export function estadoAviso(ot: OrdenTrabajo, hoy: FechaISO, avisoDiasAntes: number): EstadoAviso {
  if (ot.estado === 'terminada') return 'terminada';
  const faltan = diasEntre(hoy, ot.fechaProgramada);
  if (faltan < 0) return 'vencida';
  if (faltan <= avisoDiasAntes) return 'por_vencer';
  return 'programada';
}

/** Con cuántos días se avisa una OT: los de su rutina, o un valor fijo para las correctivas. */
export function diasDeAviso(ot: OrdenTrabajo, rutinas: RutinaPreventiva[], porDefecto = 3): number {
  return rutinas.find(r => r.id === ot.rutinaId)?.avisoDiasAntes ?? porDefecto;
}

/**
 * Deja una OT preventiva abierta por cada rutina activa, al día con la rutina:
 * - si una rutina activa no tiene OT abierta, la crea para su próxima fecha;
 * - si la tiene pendiente (no empezada), le actualiza fecha, tarea y responsable por si la rutina cambió;
 * - las OT pendientes de rutinas que se desactivaron o borraron se quitan (una empezada no se toca).
 * Devuelve la lista nueva (o la misma, si no hubo cambios).
 */
export function sincronizarOrdenes(rutinas: RutinaPreventiva[], ordenes: OrdenTrabajo[], nuevoId: () => string): OrdenTrabajo[] {
  let cambio = false;
  let numero = ultimoNumeroOT(ordenes);
  const activas = new Map(rutinas.filter(r => r.activa).map(r => [r.id, r]));

  const resultado = ordenes.filter(o => {
    if (o.tipo !== 'preventiva' || o.estado !== 'pendiente' || !o.rutinaId) return true;
    if (activas.has(o.rutinaId)) return true;
    cambio = true;
    return false;
  }).map(o => {
    const r = o.rutinaId ? activas.get(o.rutinaId) : undefined;
    if (!r || o.estado !== 'pendiente') return o;
    const mismosRepuestos = JSON.stringify(o.repuestos) === JSON.stringify(copiarRepuestos(r.repuestos, o.repuestos));
    const mismasMediciones = JSON.stringify(medicionesDe(o)) === JSON.stringify(medicionesDe(r));
    if (o.fechaProgramada === r.proximaFecha && o.tareas === r.tarea && o.asignadoA === r.responsable && o.equipoId === r.equipoId && mismosRepuestos && mismasMediciones) return o;
    cambio = true;
    // Si cambiaron las tareas, las marcas y los valores ya no corresponden: se empieza de cero.
    const mismas = o.tareas === r.tarea;
    return {
      ...o, fechaProgramada: r.proximaFecha, tareas: r.tarea, tareasHechas: mismas ? o.tareasHechas : [], valores: mismas ? o.valores : [],
      asignadoA: r.responsable, equipoId: r.equipoId, repuestos: copiarRepuestos(r.repuestos, o.repuestos), mediciones: medicionesDe(r),
    };
  });

  for (const r of activas.values()) {
    const abierta = resultado.some(o => o.rutinaId === r.id && o.estado !== 'terminada');
    if (abierta) continue;
    cambio = true;
    numero += 1;
    resultado.push({
      id: nuevoId(), numero: numeroOT(numero), tipo: 'preventiva', equipoId: r.equipoId, rutinaId: r.id,
      fechaProgramada: r.proximaFecha, tareas: r.tarea, tareasHechas: [], asignadoA: r.responsable, estado: 'pendiente',
      fechaCierre: null, observaciones: '', horas: null, repuestosUsados: '', repuestos: copiarRepuestos(r.repuestos, []), correctivo: null,
      mediciones: medicionesDe(r), valores: [], tecnicos: [], liberacion: null,
    });
  }
  return cambio ? resultado : ordenes;
}

/** Los repuestos de la rutina para su OT (mismos ids que ya tenía la OT, para no cambiar si nada cambió). */
function copiarRepuestos(deRutina: RepuestoLinea[], enOt: RepuestoLinea[]): RepuestoLinea[] {
  return deRutina.map((r, i) => ({ ...r, id: enOt[i]?.id ?? `${r.id}`, usado: null }));
}

export interface DatosCierre {
  fechaCierre: FechaISO;
  /** Qué tareas se hicieron (una marca por tarea). */
  tareasHechas: boolean[];
  realizadoPor: string;
  observaciones: string;
  horas: number | null;
  /** Texto libre (opcional, además de los repuestos con detalle). */
  repuestosUsados: string;
  /** Los repuestos de la OT con la cantidad que realmente se usó (0 = no se cambió) y los que se agregaron. */
  repuestos: RepuestoLinea[];
  /** Técnicos con sus horarios (si se cargan, las horas son la suma de sus horas hombre). */
  tecnicos?: TrabajoTecnico[];
  /** Controles de entrega del equipo y quién lo recibió. */
  liberacion?: Liberacion | null;
  /** Solo correctivas: causa, solución y horas de parada (la prioridad y la falla vienen de la OT). */
  correctivo?: Pick<DetalleCorrectivo, 'causa' | 'solucion' | 'horasParada'>;
}

/** Repuestos efectivamente usados (cantidad > 0), con la cantidad usada como cantidad. */
export function repuestosUsados(lineas: RepuestoLinea[]): RepuestoLinea[] {
  return lineas.filter(r => (r.usado ?? 0) > 0 && (r.codigo.trim() || r.descripcion.trim())).map(r => ({ ...r, cantidad: r.usado!, usado: r.usado }));
}

/** "Motor: 2 × YAR 206 Rodamiento; Sello: 1 × S35" para textos cortos (Excel, PDF). */
export function textoRepuestos(lineas: RepuestoLinea[]): string {
  return lineas.map(r => `${r.componente ? `${r.componente}: ` : ''}${r.cantidad} × ${[r.codigo, r.descripcion].filter(Boolean).join(' ')}`).join('; ');
}

/**
 * Terminar una OT: queda cerrada, se anota en el historial del equipo y, si es de una rutina,
 * la rutina pasa a su fecha siguiente (contada desde el día en que se hizo).
 */
export function cerrarOrden(ot: OrdenTrabajo, datos: DatosCierre, rutina: RutinaPreventiva | undefined, nuevoId: () => string) {
  const tareas = listaDeTareas(ot.tareas);
  const marcas = tareas.map((_, i) => datos.tareasHechas[i] === true);
  const hechas = tareas.filter((_, i) => marcas[i]);
  const pendientes = tareas.filter((_, i) => !marcas[i]);
  const correctivo = ot.correctivo ? { ...ot.correctivo, ...(datos.correctivo ?? {}) } : null;
  const mediciones = medicionesDe(ot);
  const valores = valoresDe(ot);
  const fuera = tareas.flatMap((texto, i) => (fueraDeRango(mediciones[i], valores[i]) ? [{ texto, valor: valores[i]!, medicion: mediciones[i]! }] : []));
  const usados = repuestosUsados(datos.repuestos);
  const otCerrada: OrdenTrabajo = {
    ...ot, estado: 'terminada', fechaCierre: datos.fechaCierre, observaciones: datos.observaciones, tareasHechas: marcas, valores, tecnicos: datos.tecnicos ?? [], liberacion: datos.liberacion ?? null,
    horas: datos.horas, repuestosUsados: datos.repuestosUsados, asignadoA: datos.realizadoPor || ot.asignadoA,
    repuestos: datos.repuestos.map(r => ({ ...r, usado: r.usado ?? 0 })), correctivo,
  };
  const detalle = datos.observaciones.trim();
  // En el historial queda qué se hizo y qué no (si la OT tenía una sola tarea y se hizo, alcanza con nombrarla).
  const resumen = tareas.length <= 1 && !pendientes.length
    ? (tareas[0] ?? ot.tareas)
    : [
      // El detalle de cada tarea queda en el historial (tareas), acá va el resumen.
      `${hechas.length} de ${tareas.length} tareas hechas.`,
      pendientes.length ? `Sin hacer: ${pendientes.join('; ')}.` : '',
      fuera.length ? `Fuera de rango: ${fuera.map(f => `${f.texto} ${numeroCorto(f.valor)} ${f.medicion.unidad}`.trim()).join('; ')}.` : '',
    ].filter(Boolean).join(' ');
  const intervencion: Intervencion = {
    id: nuevoId(), equipoId: ot.equipoId, fecha: datos.fechaCierre,
    tipo: ot.tipo === 'preventiva' ? 'preventivo' : 'correctivo',
    descripcion: `${ot.numero}: ${resumen}${detalle ? ` — ${detalle}` : ''}`,
    realizadoPor: datos.realizadoPor || ot.asignadoA, horas: datos.horas, repuestosUsados: datos.repuestosUsados, otId: ot.id,
    repuestos: usados, correctivo, otNumero: ot.numero, tecnicos: datos.tecnicos ?? [], liberacion: datos.liberacion ?? null,
    tareas: tareas.map((texto, i) => (mediciones[i] ? { texto, hecha: marcas[i], medicion: mediciones[i], valor: valores[i] } : { texto, hecha: marcas[i] })),
  };
  // Lo que se usó se descuenta del stock (lo que no se cambió, no).
  const consumos: ConsumoStock[] = usados.filter(r => r.codigo.trim()).map(r => ({
    id: nuevoId(), fecha: datos.fechaCierre, codigo: r.codigo, descripcion: r.descripcion, cantidad: r.cantidad,
    equipoId: ot.equipoId, otId: ot.id, intervencionId: intervencion.id,
  }));
  const rutinaNueva = rutina ? { ...rutina, proximaFecha: sumarDias(datos.fechaCierre, rutina.frecuenciaDias) } : undefined;
  return { ot: otCerrada, intervencion, rutina: rutinaNueva, pendientes, consumos, fueraDeRango: fuera };
}

/**
 * Las fechas futuras en que va a tocar una rutina dentro de [desde, hasta], SIN contar la próxima
 * (esa ya tiene su OT). Sirven para mostrar en el calendario lo que viene más adelante.
 */
export function proyectarFechas(rutina: RutinaPreventiva, desde: FechaISO, hasta: FechaISO, maximo = 60): FechaISO[] {
  if (!rutina.activa || rutina.frecuenciaDias < 1) return [];
  const fechas: FechaISO[] = [];
  let f = sumarDias(rutina.proximaFecha, rutina.frecuenciaDias);
  while (diasEntre(f, hasta) >= 0 && fechas.length < maximo) {
    if (diasEntre(desde, f) >= 0) fechas.push(f);
    f = sumarDias(f, rutina.frecuenciaDias);
  }
  return fechas;
}

/** Resumen para el aviso de arriba: cuántas OT abiertas están vencidas y cuántas por vencer. */
export function resumenAvisos(ordenes: OrdenTrabajo[], rutinas: RutinaPreventiva[], hoy: FechaISO) {
  let vencidas = 0;
  let porVencer = 0;
  for (const o of ordenes) {
    const e = estadoAviso(o, hoy, diasDeAviso(o, rutinas));
    if (e === 'vencida') vencidas += 1;
    else if (e === 'por_vencer') porVencer += 1;
  }
  return { vencidas, porVencer };
}
