// Tipos del módulo de Mantenimiento (equipos, historial, repuestos críticos, manuales,
// rutinas preventivas y órdenes de trabajo). Todavía NO existen en la base: hoy las
// pantallas usan datos de ejemplo (datosDemo.ts) a través de los hooks use*.ts.
// Cuando se conecte la base, estas formas son las que tienen que devolver esos hooks.

/** Fecha sin hora, como texto yyyy-mm-dd (igual que las columnas "date" de la base). */
export type FechaISO = string;

export interface Equipo {
  id: string;
  /** Código corto del equipo (también es lo que lleva su QR). Único. */
  codigo: string;
  nombre: string;
  /** Sector productivo. Es una etiqueta, no una carpeta. */
  sector: string;
  /** Sub-sector dentro del sector (opcional; ej.: Servicios → "Aire comprimido"). */
  subsector: string;
  /** Palabras clave libres para encontrarlo rápido ("bomba", "línea 1", "frío"). */
  etiquetas: string[];
  marca: string;
  modelo: string;
  numeroSerie: string;
  ubicacion: string;
  critico: boolean;
  notas: string;
  /**
   * Si es un sub-equipo, el equipo principal al que pertenece (ej.: la bomba de un pasteurizador).
   * Un solo nivel: un sub-equipo no puede tener sub-equipos propios.
   */
  padreId: string | null;
}

export type TipoMantenimiento = 'correctivo' | 'preventivo';

/**
 * Un repuesto en una OT, una rutina o el historial: qué repuesto (código del Depósito), cuántos y en qué
 * componente del equipo va (un sub-equipo o una parte escrita a mano, ej.: "Motor lado acople").
 */
export interface RepuestoLinea {
  id: string;
  componente: string;
  codigo: string;
  descripcion: string;
  /** Cantidad prevista (en la OT o la rutina) o usada (en el historial). */
  cantidad: number;
  /** Cantidad que realmente se usó, al terminar la OT (null mientras está abierta). */
  usado: number | null;
  /**
   * Precio por unidad, en pesos, que se anota al terminar la OT o al registrar el mantenimiento (para los costos
   * del equipo). Queda guardado con el precio de ese día aunque después aumente. Sin anotar = null.
   */
  precio?: number | null;
}

export type Prioridad = 'urgente' | 'normal';

/** Datos propios de un correctivo (falla, causa, solución y tiempo de equipo parado). */
export interface DetalleCorrectivo {
  prioridad: Prioridad;
  /** Lo que se reportó: el síntoma ("pierde agua por el sello"). */
  falla: string;
  /** Por qué pasó (se completa al terminar). */
  causa: string;
  /** Qué se hizo para solucionarlo (se completa al terminar). */
  solucion: string;
  /** Horas que el equipo estuvo parado por la falla. */
  horasParada: number | null;
}

/** Una tarea en la que hay que anotar un valor (ej.: vibración en mm/s), con su rango normal (opcional). */
export interface Medicion {
  unidad: string;
  minimo: number | null;
  maximo: number | null;
}

/** Una tarea de una planilla: se tilda, o además se anota un valor si tiene `medicion`. */
export interface TareaDef {
  id: string;
  texto: string;
  medicion: Medicion | null;
}

/**
 * Planilla de tareas armada de antemano (ej.: "Bomba centrífuga – mensual"). Las rutinas que la usan
 * toman sus tareas de acá: si la planilla cambia, cambian todas (y sus OT pendientes).
 */
export interface PlanillaTareas {
  id: string;
  nombre: string;
  tareas: TareaDef[];
  notas: string;
}

/** Una tarea de la OT y si se hizo (para el historial); si era una medición, con el valor anotado. */
export interface TareaRegistrada {
  texto: string;
  hecha: boolean;
  medicion?: Medicion | null;
  valor?: number | null;
}

/** Un técnico que trabajó en la OT: cuándo terminó y de qué hora a qué hora (las horas hombre se calculan). */
export interface TrabajoTecnico {
  id: string;
  nombre: string;
  /** Fecha en que terminó. */
  fecha: FechaISO;
  /** Hora de inicio y de término, "HH:MM" (vacío = sin anotar). */
  inicio: string;
  fin: string;
}

/** Liberación del equipo al terminar: controles de entrega (limpieza, sanitización...) y quién lo recibió. */
export interface Liberacion {
  controles: { texto: string; ok: boolean }[];
  /** Quién recibe el equipo (por ejemplo, el responsable de Producción). */
  recibio: string;
}

/** Opciones del módulo que elige cada empresa. */
export interface ConfigMantenimiento {
  /** Datos del registro de calidad que salen arriba a la derecha de la OT impresa (ej.: REG-MANT-01). */
  registroCodigo: string;
  registroVersion: string;
  registroVigencia: FechaISO | '';
  /** Controles de la liberación del equipo (vacío = la OT no tiene liberación). */
  controlesLiberacion: string[];
  /** Quién firma la liberación (ej.: "Responsable de Producción"). */
  recibeLiberacion: string;
  /** Valor de la hora hombre de mantenimiento, en pesos, uno solo para todos (para los costos). Sin cargar = null. */
  costoHora: number | null;
  /** Horario en que les llegan las OT terminadas al jefe de taller y al responsable (fuera de ese horario esperan). */
  horarioRecepcion: HorarioRecepcion;
}

/**
 * Gasto de un servicio externo (un técnico de afuera, un taller, un service), cargado directo en el equipo.
 * PARA ERIC: tabla nueva (ver NOTAS-PARA-ERIC.md).
 */
export interface GastoExterno {
  id: string;
  equipoId: string;
  fecha: FechaISO;
  /** Quién lo hizo (empresa o persona). */
  proveedor: string;
  /** Qué se hizo. */
  descripcion: string;
  /** Monto en pesos. */
  monto: number;
}

/** Una entrada del historial del equipo (lo que se hizo). */
export interface Intervencion {
  id: string;
  equipoId: string;
  fecha: FechaISO;
  tipo: TipoMantenimiento;
  descripcion: string;
  realizadoPor: string;
  /** Horas de trabajo (opcional). */
  horas: number | null;
  /** Repuestos usados, en texto libre (registros viejos o importados de Excel). */
  repuestosUsados: string;
  /** Si salió de una orden de trabajo, cuál. */
  otId: string | null;
  /** Repuestos usados con su componente (los que se descontaron del stock). */
  repuestos: RepuestoLinea[];
  /** Las tareas de la OT y cuáles se hicieron. */
  tareas: TareaRegistrada[];
  /** Solo en correctivos. */
  correctivo: DetalleCorrectivo | null;
  /** Número de la OT (para mostrarlo aunque la OT se borre). */
  otNumero: string | null;
  /** Técnicos que trabajaron, con sus horarios (si salió de una OT). */
  tecnicos: TrabajoTecnico[];
  liberacion: Liberacion | null;
  /** Solo en preventivos: horas que el equipo estuvo parado (en los correctivos va en `correctivo.horasParada`). */
  horasParada?: number | null;
  /** Quién revisó (jefe de taller) y quién aprobó (responsable) la OT de la que salió. */
  revisadoPor?: string | null;
  aprobadoPor?: string | null;
}

/** Repuesto crítico de un equipo. Se vincula por código con los repuestos del Depósito. */
export interface RepuestoCritico {
  id: string;
  equipoId: string;
  codigo: string;
  descripcion: string;
  /** Cuántos conviene tener siempre para este equipo. */
  cantidad: number;
  nota: string;
}

export interface Manual {
  id: string;
  equipoId: string;
  nombre: string;
  /** Dirección para abrir el archivo. En modo de ejemplo solo vive mientras la página está abierta. */
  url: string | null;
  tamanioBytes: number | null;
  subidoEl: FechaISO;
}

/** Rutina de mantenimiento preventivo: algo que se repite cada N días en un equipo. */
export interface RutinaPreventiva {
  id: string;
  equipoId: string;
  /** Lo que hay que hacer: una tarea por renglón. */
  tarea: string;
  /** Cada cuántos días se repite. */
  frecuenciaDias: number;
  /** Fecha de la próxima vez que toca. */
  proximaFecha: FechaISO;
  /** Con cuántos días de anticipación se avisa. */
  avisoDiasAntes: number;
  responsable: string;
  activa: boolean;
  /** Repuestos que lleva cada vez (se copian a cada OT que genera). */
  repuestos: RepuestoLinea[];
  /** Si toma las tareas de una planilla (entonces `tarea` y `mediciones` se copian de ella). */
  planillaId: string | null;
  /** Una por renglón de `tarea` (mismo orden): null = se tilda; si no, hay que anotar un valor. */
  mediciones: (Medicion | null)[];
}

export type TipoOT = 'preventiva' | 'correctiva';
/** Cómo va el trabajo: sin empezar, empezado, o terminado por el técnico. */
export type EstadoOT = 'pendiente' | 'en_curso' | 'terminada';

/**
 * En qué parte del circuito está la OT (quién tiene que hacer algo con ella):
 * - por_derivar: preventiva recién generada, la tiene que mandar el responsable al jefe de taller.
 * - por_asignar: la tiene el jefe de taller, que la asigna a uno o varios técnicos.
 * - asignada: la tienen los técnicos (pendiente o en curso).
 * - a_revisar: el técnico la terminó; la revisa el jefe de taller.
 * - para_aprobar: revisada; la aprueba el responsable. Recién ahí va al historial y descuenta repuestos.
 * - aprobada: cerrada.
 */
export type EtapaOT = 'por_derivar' | 'por_asignar' | 'asignada' | 'a_revisar' | 'para_aprobar' | 'aprobada';

/** Perfiles del módulo. PARA ERIC: roles nuevos de Mantenimiento (ver NOTAS-PARA-ERIC.md). */
export type RolMantenimiento = 'responsable' | 'jefe' | 'tecnico';

/** Una persona que usa el módulo. MODO DE EJEMPLO: inventadas, para probar el circuito con "Ver como". */
export interface PersonaMantenimiento {
  id: string;
  nombre: string;
  rol: RolMantenimiento;
}

/** Un paso del recorrido de la OT (quién hizo qué y cuándo), para saber siempre por dónde pasó. */
export interface PasoOT {
  /** Fecha y hora, "aaaa-mm-ddThh:mm". */
  cuando: string;
  quien: string;
  accion: string;
  comentario: string;
}

/** Un día de la semana en que se reciben OT terminadas, con su horario ("hh:mm"). */
export interface FranjaRecepcion {
  /** 0 = domingo ... 6 = sábado. */
  dia: number;
  desde: string;
  hasta: string;
}

/** Horario en que les llegan las OT terminadas al jefe de taller y al responsable (cada día con su horario). */
export interface HorarioRecepcion {
  dias: FranjaRecepcion[];
}

/** Orden de trabajo. Las preventivas las genera sola cada rutina (una por aviso). */
export interface OrdenTrabajo {
  id: string;
  /** Número visible: OT-0001, OT-0002... */
  numero: string;
  tipo: TipoOT;
  equipoId: string;
  rutinaId: string | null;
  fechaProgramada: FechaISO;
  /** Lo que hay que hacer: una tarea por renglón (se muestra como lista para tildar). */
  tareas: string;
  /** Qué tareas se hicieron: una marca por renglón de `tareas`, en el mismo orden. */
  tareasHechas: boolean[];
  asignadoA: string;
  estado: EstadoOT;
  fechaCierre: FechaISO | null;
  observaciones: string;
  horas: number | null;
  repuestosUsados: string;
  /** Repuestos previstos, con su componente; al terminar se anota cuánto se usó de cada uno. */
  repuestos: RepuestoLinea[];
  /** Solo en correctivas: prioridad, falla, causa, solución y tiempo parado. */
  correctivo: DetalleCorrectivo | null;
  /** Una por renglón de `tareas`: null = se tilda; si no, hay que anotar un valor. */
  mediciones: (Medicion | null)[];
  /** Los valores anotados, uno por renglón de `tareas` (null = sin anotar). */
  valores: (number | null)[];
  /** Al terminar: técnicos con sus horarios y la liberación del equipo. */
  tecnicos: TrabajoTecnico[];
  liberacion: Liberacion | null;
  /** Solo en preventivas, al terminar: horas que el equipo estuvo parado (en las correctivas va en `correctivo`). */
  horasParada?: number | null;
  /** En qué parte del circuito está (derivar, asignar, revisar, aprobar). */
  etapa: EtapaOT;
  /** Técnicos asignados (ids de PersonaMantenimiento). */
  asignados: string[];
  /** Recorrido: quién la derivó, asignó, terminó, revisó, devolvió o aprobó, y cuándo. */
  pasos: PasoOT[];
  /** Cuándo la terminó el técnico ("aaaa-mm-ddThh:mm"): de ahí sale cuándo les llega para revisar. */
  terminadaEn: string | null;
  /**
   * Lo que cargó el técnico al terminar. Se guarda hasta que el responsable la aprueba: recién ahí pasa al
   * historial del equipo y se descuentan los repuestos.
   */
  cierre: DatosCierre | null;
}

/** Lo que carga el técnico al terminar una OT. */
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
  /** Solo preventivas: horas que el equipo estuvo parado. */
  horasParada?: number | null;
}

/**
 * Un descuento de stock hecho al terminar una OT o registrar un mantenimiento.
 * MODO DE EJEMPLO: se guarda acá y se resta del stock que se muestra (no toca el Depósito real).
 * PARA ERIC: con la base, cada consumo es un retiro del Depósito (motivo: número de OT y equipo).
 */
export interface ConsumoStock {
  id: string;
  fecha: FechaISO;
  codigo: string;
  descripcion: string;
  cantidad: number;
  equipoId: string;
  otId: string | null;
  intervencionId: string;
}

/** Todo lo que maneja el módulo, junto (lo usa la exportación a Excel). */
export interface DatosMantenimiento {
  /** Sectores creados a mano (también cuentan los que ya usan los equipos). */
  sectores: string[];
  /** Sub-sectores creados a mano (también cuentan los que ya usan los equipos). */
  subsectores: { sector: string; nombre: string }[];
  /** Orden de los sectores elegido por la empresa (por importancia). Los que no están van al final, por nombre. */
  ordenSectores: string[];
  equipos: Equipo[];
  intervenciones: Intervencion[];
  repuestosCriticos: RepuestoCritico[];
  manuales: Manual[];
  rutinas: RutinaPreventiva[];
  ordenes: OrdenTrabajo[];
  /** Descuentos de stock (modo de ejemplo). */
  consumos: ConsumoStock[];
  /** Planillas de tareas armadas de antemano. */
  planillas: PlanillaTareas[];
  /** Gastos de servicios externos, por equipo. */
  gastosExternos: GastoExterno[];
  config: ConfigMantenimiento;
  /** Personas del módulo (modo de ejemplo). */
  personas: PersonaMantenimiento[];
}
