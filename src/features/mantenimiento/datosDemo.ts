// DATOS DE EJEMPLO — INVENTADOS. No son equipos, personas ni marcas reales.
// Sirven para ver y probar las pantallas hasta que exista la base de datos del módulo.
// Las fechas se calculan a partir de hoy, así el calendario siempre muestra algo vencido,
// algo por vencer y algo más adelante.

import { fechaHoyISO } from '../../lib/fechaHoy';
import { sumarDias } from './fechas';
import { aplicarPlanillas, configInicial, sincronizarOrdenes } from './preventivo';
import type { OrdenTrabajo, PersonaMantenimiento, DatosMantenimiento, Equipo, GastoExterno, Intervencion, Medicion, PlanillaTareas, RepuestoCritico, RutinaPreventiva, TareaRegistrada } from './tipos';

function pasteurizador(n: string, id: string, serie: string): Equipo[] {
  const codigo = `PA-0${n}`;
  const base = { sector: 'Proceso', subsector: '', marca: 'Marca J', ubicacion: 'Sala de proceso', notas: 'EJEMPLO.' };
  return [
    { ...base, id, codigo, nombre: `Pasteurizador ${n}`, etiquetas: ['pasteurizador', 'línea de proceso'], modelo: 'PZ-10000', numeroSerie: serie, critico: true, subsector: '', padreId: null },
    { ...base, id: `${id}-pl`, codigo: `${codigo}-PL`, nombre: 'Placa intercambiadora', etiquetas: ['placas', 'juntas'], modelo: 'IP-45', numeroSerie: `${serie}-PL`, critico: true, padreId: id },
    { ...base, id: `${id}-b1`, codigo: `${codigo}-B1`, nombre: 'Bomba de alimentación', etiquetas: ['bomba'], modelo: 'BC-150', numeroSerie: `${serie}-B1`, critico: false, padreId: id },
    { ...base, id: `${id}-b2`, codigo: `${codigo}-B2`, nombre: 'Bomba de retorno', etiquetas: ['bomba'], modelo: 'BC-150', numeroSerie: `${serie}-B2`, critico: false, padreId: id },
    { ...base, id: `${id}-se`, codigo: `${codigo}-SE`, nombre: 'Separadora', etiquetas: ['separadora', 'centrífuga'], modelo: 'SC-20', numeroSerie: `${serie}-SE`, critico: true, padreId: id },
  ];
}

const VIBRACION: Medicion = { unidad: 'mm/s', minimo: 0, maximo: 4.5 };
const TEMP_ROD: Medicion = { unidad: '°C', minimo: null, maximo: 80 };
const CORRIENTE: Medicion = { unidad: 'A', minimo: 0, maximo: 18 };
const PRESION: Medicion = { unidad: 'bar', minimo: 6, maximo: 8 };
const TEMP_SALIDA: Medicion = { unidad: '°C', minimo: null, maximo: 95 };

const planillas: PlanillaTareas[] = [
  {
    id: 'pl-1', nombre: 'Bomba centrífuga – quincenal (ejemplo)', notas: 'EJEMPLO.', tareas: [
      { id: 'pt-1', texto: 'Engrasar rodamientos del motor', medicion: null },
      { id: 'pt-2', texto: 'Engrasar rodamientos de la bomba', medicion: null },
      { id: 'pt-3', texto: 'Medir vibración del motor', medicion: VIBRACION },
      { id: 'pt-4', texto: 'Medir temperatura de rodamientos', medicion: TEMP_ROD },
      { id: 'pt-5', texto: 'Medir corriente del motor', medicion: CORRIENTE },
      { id: 'pt-6', texto: 'Controlar pérdidas en el sello', medicion: null },
      { id: 'pt-7', texto: 'Controlar ajuste de bulones de base', medicion: null },
    ],
  },
  {
    id: 'pl-2', nombre: 'Compresor a tornillo – mensual (ejemplo)', notas: 'EJEMPLO.', tareas: [
      { id: 'pt-8', texto: 'Cambiar filtro de aire', medicion: null },
      { id: 'pt-9', texto: 'Controlar nivel de aceite', medicion: null },
      { id: 'pt-10', texto: 'Purgar condensado', medicion: null },
      { id: 'pt-11', texto: 'Medir presión de trabajo', medicion: PRESION },
      { id: 'pt-12', texto: 'Medir temperatura de salida del aire', medicion: TEMP_SALIDA },
      { id: 'pt-13', texto: 'Limpiar radiador', medicion: null },
    ],
  },
];

/** Tareas de la planilla de bombas, todas hechas, con los valores anotados ese día. */
function tareasBomba(vib: number, temp: number, amp: number): TareaRegistrada[] {
  const valores: Record<string, number> = { 'pt-3': vib, 'pt-4': temp, 'pt-5': amp };
  return planillas[0].tareas.map(t => (t.medicion ? { texto: t.texto, hecha: true, medicion: t.medicion, valor: valores[t.id] } : { texto: t.texto, hecha: true }));
}
function tareasCompresor(bar: number, temp: number): TareaRegistrada[] {
  const valores: Record<string, number> = { 'pt-11': bar, 'pt-12': temp };
  return planillas[1].tareas.map(t => (t.medicion ? { texto: t.texto, hecha: true, medicion: t.medicion, valor: valores[t.id] } : { texto: t.texto, hecha: true }));
}

export function crearDatosDemo(hoy = fechaHoyISO()): DatosMantenimiento {
  const d = (dias: number) => sumarDias(hoy, dias);

  const equipos: Equipo[] = [
    { id: 'eq-1', codigo: 'BC-01', nombre: 'Bomba centrífuga de agua', sector: 'Servicios', etiquetas: ['bomba', 'agua', 'sala de bombas'], marca: 'Marca A', modelo: 'CX-200', numeroSerie: 'EJ-48213', ubicacion: 'Sala de bombas', critico: true, notas: 'EJEMPLO. Alimenta toda la planta.', subsector: 'Agua', padreId: null },
    { id: 'eq-2', codigo: 'CP-01', nombre: 'Compresor de aire a tornillo', sector: 'Servicios', etiquetas: ['compresor', 'aire comprimido'], marca: 'Marca B', modelo: 'T-75', numeroSerie: 'EJ-99120', ubicacion: 'Sala de compresores', critico: true, notas: 'EJEMPLO.', subsector: 'Aire comprimido', padreId: null },
    { id: 'eq-3', codigo: 'CT-02', nombre: 'Cinta transportadora de salida', sector: 'Envasado', etiquetas: ['cinta', 'línea 1', 'motorreductor'], marca: 'Marca C', modelo: 'CT-6m', numeroSerie: 'EJ-30551', ubicacion: 'Línea 1', critico: false, notas: 'EJEMPLO.', subsector: '', padreId: null },
    { id: 'eq-4', codigo: 'EN-01', nombre: 'Envasadora automática', sector: 'Envasado', etiquetas: ['envasadora', 'línea 1', 'neumática'], marca: 'Marca D', modelo: 'EV-1200', numeroSerie: 'EJ-77001', ubicacion: 'Línea 1', critico: true, notas: 'EJEMPLO.', subsector: '', padreId: null },
    { id: 'eq-5', codigo: 'CF-01', nombre: 'Equipo de frío de cámara', sector: 'Almacenamiento', etiquetas: ['frío', 'cámara', 'refrigeración'], marca: 'Marca E', modelo: 'RF-30', numeroSerie: 'EJ-11045', ubicacion: 'Cámara 1', critico: true, notas: 'EJEMPLO.', subsector: '', padreId: null },
    { id: 'eq-6', codigo: 'TQ-03', nombre: 'Tanque con agitador', sector: 'Proceso', etiquetas: ['tanque', 'agitador', 'motor'], marca: 'Marca F', modelo: 'AG-500', numeroSerie: 'EJ-62290', ubicacion: 'Sala de proceso', critico: false, notas: 'EJEMPLO.', subsector: '', padreId: null },
    { id: 'eq-7', codigo: 'AE-01', nombre: 'Autoelevador eléctrico', sector: 'Almacenamiento', etiquetas: ['autoelevador', 'batería'], marca: 'Marca G', modelo: 'AE-2T', numeroSerie: 'EJ-50318', ubicacion: 'Depósito', critico: false, notas: 'EJEMPLO.', subsector: '', padreId: null },
    { id: 'eq-8', codigo: 'CA-01', nombre: 'Caldera de vapor', sector: 'Servicios', etiquetas: ['caldera', 'vapor', 'quemador'], marca: 'Marca H', modelo: 'CV-1000', numeroSerie: 'EJ-20077', ubicacion: 'Sala de calderas', critico: true, notas: 'EJEMPLO.', subsector: 'Vapor', padreId: null },
    // Dos equipos iguales con sus sub-equipos (el segundo se armó con "Duplicar").
    ...pasteurizador('1', 'eq-p1', 'EJ-P1'),
    ...pasteurizador('2', 'eq-p2', 'EJ-P2'),
  ];

  const intervenciones: Intervencion[] = [
    { id: 'in-1', equipoId: 'eq-1', fecha: d(-40), tipo: 'correctivo', descripcion: 'Pérdida por sello mecánico. Se cambió el sello.', realizadoPor: 'Técnico 1', horas: 3, repuestosUsados: '', otId: null, repuestos: [{ id: 'rl-1', componente: 'Sello mecánico', codigo: 'EJ-SELLO-01', descripcion: 'Sello mecánico (ejemplo)', cantidad: 1, usado: 1, precio: 85000 }], tareas: [], correctivo: { prioridad: 'urgente', falla: 'Pierde agua por el sello', causa: 'Sello gastado por trabajo en seco', solucion: 'Cambio de sello y control de nivel de succión', horasParada: 2 }, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-10', equipoId: 'eq-1', fecha: d(-54), tipo: 'preventivo', descripcion: 'Preventivo mensual de la bomba.', realizadoPor: 'Técnico 2', horas: 1, repuestosUsados: '', otId: null, repuestos: [], tareas: tareasBomba(1.8, 52, 13.4), correctivo: null, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-11', equipoId: 'eq-1', fecha: d(-26), tipo: 'preventivo', descripcion: 'Preventivo mensual de la bomba.', realizadoPor: 'Técnico 2', horas: 1, repuestosUsados: '', otId: null, repuestos: [], tareas: tareasBomba(2.3, 58, 13.9), correctivo: null, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-2', equipoId: 'eq-1', fecha: d(-12), tipo: 'preventivo', descripcion: 'Preventivo mensual de la bomba. La vibración viene subiendo.', realizadoPor: 'Técnico 2', horas: 1, repuestosUsados: 'Grasa', otId: null, repuestos: [], tareas: tareasBomba(3.9, 66, 14.6), correctivo: null, otNumero: null, tecnicos: [], liberacion: null, horasParada: 1 },
    { id: 'in-12', equipoId: 'eq-2', fecha: d(-50), tipo: 'preventivo', descripcion: 'Preventivo mensual del compresor.', realizadoPor: 'Técnico 1', horas: 1.5, repuestosUsados: '', otId: null, repuestos: [], tareas: tareasCompresor(7.2, 84), correctivo: null, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-3', equipoId: 'eq-2', fecha: d(-20), tipo: 'preventivo', descripcion: 'Preventivo mensual del compresor. Temperatura de salida alta.', realizadoPor: 'Técnico 1', horas: 1.5, repuestosUsados: '1 filtro de aire', otId: null, repuestos: [], tareas: tareasCompresor(7.0, 97), correctivo: null, otNumero: null, tecnicos: [], liberacion: null, horasParada: 1.5 },
    { id: 'in-4', equipoId: 'eq-3', fecha: d(-8), tipo: 'correctivo', descripcion: 'Ruido en motorreductor: rodamiento dañado. Se reemplazó.', realizadoPor: 'Técnico 2', horas: 2.5, repuestosUsados: '', otId: null, repuestos: [{ id: 'rl-2', componente: 'Motorreductor lado salida', codigo: 'EJ-ROD-6204', descripcion: 'Rodamiento de motorreductor (ejemplo)', cantidad: 2, usado: 2, precio: 32000 }], tareas: [], correctivo: { prioridad: 'normal', falla: 'Ruido fuerte en el motorreductor', causa: 'Rodamiento sin lubricación', solucion: 'Cambio de rodamientos y engrase', horasParada: 3 }, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-5', equipoId: 'eq-4', fecha: d(-3), tipo: 'correctivo', descripcion: 'Falla de cilindro neumático de corte. Se cambió el kit de juntas.', realizadoPor: 'Técnico 1', horas: 2, repuestosUsados: '1 kit de juntas', otId: null, repuestos: [], tareas: [], correctivo: { prioridad: 'urgente', falla: 'No corta el envase', causa: 'Juntas del cilindro gastadas', solucion: 'Cambio del kit de juntas', horasParada: 5 }, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-6', equipoId: 'eq-5', fecha: d(-60), tipo: 'preventivo', descripcion: 'Limpieza de condensador y control de presiones.', realizadoPor: 'Técnico 3', horas: 2, repuestosUsados: '', otId: null, repuestos: [], tareas: [], correctivo: null, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-8', equipoId: 'eq-p1-pl', fecha: d(-15), tipo: 'correctivo', descripcion: 'Pérdida entre placas. Se cambiaron 4 juntas.', realizadoPor: 'Técnico 1', horas: 4, repuestosUsados: '4 juntas de placa', otId: null, repuestos: [], tareas: [], correctivo: { prioridad: 'urgente', falla: 'Pérdida entre placas', causa: 'Juntas vencidas', solucion: 'Cambio de 4 juntas', horasParada: 8 }, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-9', equipoId: 'eq-p1-b1', fecha: d(-30), tipo: 'preventivo', descripcion: 'Cambio de sello y control de rodamientos.', realizadoPor: 'Técnico 2', horas: 1.5, repuestosUsados: '1 sello', otId: null, repuestos: [], tareas: [], correctivo: null, otNumero: null, tecnicos: [], liberacion: null },
    { id: 'in-7', equipoId: 'eq-8', fecha: d(-25), tipo: 'preventivo', descripcion: 'Purga de fondo y control de quemador.', realizadoPor: 'Técnico 3', horas: 1, repuestosUsados: '', otId: null, repuestos: [], tareas: [], correctivo: null, otNumero: null, tecnicos: [], liberacion: null, horasParada: 2 },
  ];

  const repuestosCriticos: RepuestoCritico[] = [
    { id: 'rc-1', equipoId: 'eq-1', codigo: 'EJ-SELLO-01', descripcion: 'Sello mecánico (ejemplo)', cantidad: 1, nota: '' },
    { id: 'rc-2', equipoId: 'eq-1', codigo: 'EJ-ROD-6305', descripcion: 'Rodamiento (ejemplo)', cantidad: 2, nota: '' },
    { id: 'rc-3', equipoId: 'eq-2', codigo: 'EJ-FILT-AIRE', descripcion: 'Filtro de aire (ejemplo)', cantidad: 2, nota: 'Cambiar cada 2000 h' },
    { id: 'rc-4', equipoId: 'eq-3', codigo: 'EJ-ROD-6204', descripcion: 'Rodamiento de motorreductor (ejemplo)', cantidad: 2, nota: '' },
    { id: 'rc-5', equipoId: 'eq-4', codigo: 'EJ-KIT-CIL', descripcion: 'Kit de juntas de cilindro (ejemplo)', cantidad: 1, nota: '' },
  ];

  const rutinasSinPlanilla: RutinaPreventiva[] = [
    { id: 'ru-1', equipoId: 'eq-1', planillaId: 'pl-1', mediciones: [], tarea: '', frecuenciaDias: 14, proximaFecha: d(2), avisoDiasAntes: 3, responsable: 'Técnico 2', activa: true, repuestos: [
      { id: 'rr-1', componente: 'Motor', codigo: 'EJ-ROD-6305', descripcion: 'Rodamiento (ejemplo)', cantidad: 2, usado: null },
      { id: 'rr-2', componente: 'Sello mecánico', codigo: 'EJ-SELLO-01', descripcion: 'Sello mecánico (ejemplo)', cantidad: 1, usado: null },
    ] },
    { id: 'ru-2', equipoId: 'eq-2', planillaId: 'pl-2', mediciones: [], tarea: '', frecuenciaDias: 30, proximaFecha: d(10), avisoDiasAntes: 5, responsable: 'Técnico 1', activa: true, repuestos: [] },
    { id: 'ru-3', planillaId: null, mediciones: [], equipoId: 'eq-3', tarea: 'Controlar tensión de la cinta\nControlar alineación\nEngrasar rodillos\nRevisar empalme de la cinta', frecuenciaDias: 7, proximaFecha: d(-2), avisoDiasAntes: 2, responsable: 'Técnico 2', activa: true, repuestos: [] },
    { id: 'ru-4', planillaId: null, mediciones: [], equipoId: 'eq-5', tarea: 'Limpiar condensador\nControlar presiones de alta y baja\nControlar temperatura de la cámara\nRevisar burletes de puertas\nLimpiar bandeja de condensado\nControlar consumo del compresor', frecuenciaDias: 60, proximaFecha: d(0), avisoDiasAntes: 7, responsable: 'Técnico 3', activa: true, repuestos: [] },
    { id: 'ru-5', planillaId: null, mediciones: [], equipoId: 'eq-8', tarea: 'Purga de fondo\nControlar llama del quemador\nControlar válvula de seguridad\nControlar nivel de agua', frecuenciaDias: 30, proximaFecha: d(5), avisoDiasAntes: 3, responsable: 'Técnico 3', activa: true, repuestos: [] },
    { id: 'ru-7', planillaId: null, mediciones: [], equipoId: 'eq-p2-se', tarea: 'Limpieza del tambor\nControlar vibraciones\nControlar nivel de aceite', frecuenciaDias: 30, proximaFecha: d(12), avisoDiasAntes: 3, responsable: 'Técnico 2', activa: true, repuestos: [] },
    { id: 'ru-6', planillaId: null, mediciones: [], equipoId: 'eq-7', tarea: 'Controlar carga de batería\nControlar nivel de agua de la batería\nRevisar horquillas y cadenas', frecuenciaDias: 7, proximaFecha: d(18), avisoDiasAntes: 2, responsable: 'Técnico 1', activa: true, repuestos: [] },
  ];

  // Las rutinas de la bomba y del compresor toman sus tareas de una planilla.
  const rutinas = aplicarPlanillas(rutinasSinPlanilla, planillas);
  let n = 0;
  const generadas = sincronizarOrdenes(rutinas, [], () => `ot-${++n}`);
  const ordenes = recorridoDeEjemplo(generadas, d);

  const sectores = [...new Set(equipos.map(e => e.sector))];
  const gastosExternos: GastoExterno[] = [
    { id: 'ge-1', equipoId: 'eq-2', fecha: d(-35), proveedor: 'Service de compresores (ejemplo)', descripcion: 'Service de las 4000 horas', monto: 420000 },
    { id: 'ge-2', equipoId: 'eq-5', fecha: d(-18), proveedor: 'Frigorista (ejemplo)', descripcion: 'Carga de gas refrigerante', monto: 150000 },
  ];

  return { sectores, subsectores: [], ordenSectores: [], equipos, intervenciones, repuestosCriticos, manuales: [], rutinas, ordenes, consumos: [], planillas, gastosExternos, personas: PERSONAS, config: { ...configInicial(), registroCodigo: 'REG-MANT-01 (ejemplo)', registroVersion: '01', registroVigencia: d(-200), costoHora: 15000 } };
}

/** Personas inventadas para probar el circuito de las OT con "Ver como". */
export const PERSONAS: PersonaMantenimiento[] = [
  { id: 'p-resp', nombre: 'Responsable (vos)', rol: 'responsable' },
  { id: 'p-jefe', nombre: 'Jefe de taller', rol: 'jefe' },
  { id: 'p-t1', nombre: 'Técnico 1', rol: 'tecnico' },
  { id: 'p-t2', nombre: 'Técnico 2', rol: 'tecnico' },
  { id: 'p-t3', nombre: 'Técnico 3', rol: 'tecnico' },
];

/** Deja las OT de ejemplo en distintas partes del circuito, para que se vea cada color. */
function recorridoDeEjemplo(ordenes: OrdenTrabajo[], d: (dias: number) => string): OrdenTrabajo[] {
  const t = (id: string) => PERSONAS.find(p => p.id === id)!.nombre;
  const res = ordenes.map(o => {
    if (o.rutinaId === 'ru-3') {
      // Cinta: vencida, asignada y empezada.
      return { ...o, etapa: 'asignada' as const, estado: 'en_curso' as const, asignados: ['p-t2'], asignadoA: t('p-t2'), pasos: [
        { cuando: `${d(-6)}T08:40`, quien: 'Responsable (vos)', accion: 'Derivó al jefe de taller', comentario: '' },
        { cuando: `${d(-6)}T09:10`, quien: 'Jefe de taller', accion: `Asignó a ${t('p-t2')}`, comentario: '' },
      ] };
    }
    if (o.rutinaId === 'ru-4') {
      // Equipo de frío: derivada, falta que el jefe la asigne.
      return { ...o, etapa: 'por_asignar' as const, pasos: [{ cuando: `${d(-3)}T09:00`, quien: 'Responsable (vos)', accion: 'Derivó al jefe de taller', comentario: '' }] };
    }
    if (o.rutinaId === 'ru-2') {
      // Compresor: asignada a dos técnicos.
      return { ...o, etapa: 'asignada' as const, asignados: ['p-t1', 'p-t3'], asignadoA: `${t('p-t1')}, ${t('p-t3')}`, pasos: [
        { cuando: `${d(-1)}T08:45`, quien: 'Responsable (vos)', accion: 'Derivó al jefe de taller', comentario: '' },
        { cuando: `${d(-1)}T10:00`, quien: 'Jefe de taller', accion: `Asignó a ${t('p-t1')}, ${t('p-t3')}`, comentario: '' },
      ] };
    }
    return o;
  });
  // Dos correctivas que cargaron los técnicos después de un llamado de guardia.
  const correctiva = (num: number, equipoId: string, dia: number, hora: string, tecnico: string, etapa: 'a_revisar' | 'para_aprobar', falla: string, causa: string, solucion: string, observaciones: string, parada: number): OrdenTrabajo => {
    const fecha = d(dia);
    const pasos = [{ cuando: `${fecha}T${hora}`, quien: t(tecnico), accion: 'Cargó la OT correctiva y la terminó', comentario: '' }];
    if (etapa === 'para_aprobar') pasos.push({ cuando: `${d(dia + 1)}T09:15`, quien: 'Jefe de taller', accion: 'Revisó y pasó a aprobación', comentario: '' });
    const tecnicos = [{ id: `tt-${num}`, nombre: t(tecnico), fecha, inicio: '06:30', fin: hora }];
    return {
      id: `ot-c${num}`, numero: `OT-${String(num).padStart(4, '0')}`, tipo: 'correctiva', equipoId, rutinaId: null, fechaProgramada: fecha,
      tareas: '', tareasHechas: [], asignadoA: t(tecnico), estado: 'terminada', fechaCierre: fecha,
      observaciones, horas: null, repuestosUsados: '', repuestos: [], mediciones: [], valores: [], tecnicos, liberacion: null,
      correctivo: { prioridad: 'urgente', falla, causa, solucion, horasParada: parada },
      etapa, asignados: [tecnico], pasos, terminadaEn: `${fecha}T${hora}`,
      cierre: {
        fechaCierre: fecha, tareasHechas: [], realizadoPor: t(tecnico), observaciones, horas: null, repuestosUsados: '', repuestos: [], tecnicos, liberacion: null,
        correctivo: { causa, solucion, horasParada: parada },
      },
    };
  };
  return [
    ...res,
    correctiva(8, 'eq-4', -2, '09:50', 'p-t1', 'para_aprobar', 'Llamado de guardia: la envasadora no corta el envase', 'Cuchilla desafilada', 'Se revisó el cilindro de corte, se cambió la cuchilla, se ajustó el recorrido y se probó en marcha.', '', 2),
    correctiva(9, 'eq-3', -1, '15:20', 'p-t2', 'a_revisar', 'Llamado de guardia: la cinta se frena', 'Rodillo trabado', 'Se destrabó y se engrasó el rodillo. La cinta quedó funcionando.', 'Falta cambiar el rodamiento del rodillo (no había en el depósito).', 1.5),
  ];
}

