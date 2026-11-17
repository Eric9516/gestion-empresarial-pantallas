// Tipos del módulo de Mantenimiento, etapa 1: equipos, sectores, historial, repuestos críticos y manuales. Salen del diseño del socio
// (su repositorio, src/features/mantenimiento/tipos.ts), con lo que ya guarda la base. Las órdenes de trabajo, las rutinas preventivas, las
// planillas y las mediciones llegan en las etapas 2 y 3.

/** Fecha sin hora, como texto yyyy-mm-dd (igual que las columnas "date" de la base). */
export type FechaISO = string;

export interface Equipo {
  id: string;
  /** Código corto del equipo (también es lo que lleva su QR). Único en la empresa. */
  codigo: string;
  nombre: string;
  /** El sector o sub-sector elegido (null = sin sector). */
  sectorId: string | null;
  /** Nombres para mostrar y buscar: el sector y, si el elegido es un sub-sector, el sub-sector. */
  sector: string;
  subsector: string;
  /** Palabras clave libres para encontrarlo rápido ("bomba", "línea 1", "frío"). */
  etiquetas: string[];
  marca: string;
  modelo: string;
  numeroSerie: string;
  ubicacion: string;
  critico: boolean;
  notas: string;
  /** Si es un sub-equipo, el equipo principal al que pertenece. Un solo nivel. */
  padreId: string | null;
}

/** Lo que la lista muestra de cada equipo además de sus datos (lo calcula el servidor). */
export interface ResumenDeEquipo {
  /** El último registro del historial. */
  ultimo: { fecha: FechaISO; tipo: TipoMantenimiento } | null;
  /** Tuvo un correctivo en los últimos 30 días. */
  correctivoReciente: boolean;
  /** A alguno de sus repuestos críticos no le alcanza el stock del Depósito. */
  faltaRepuesto: boolean;
}

export interface EquipoDeLista extends Equipo {
  resumen: ResumenDeEquipo;
}

export interface Sector {
  id: string;
  nombre: string;
  /** null = sector; si no, es un sub-sector de ese sector. */
  padreId: string | null;
  orden: number | null;
}

export interface SubsectorConCantidad { id: string; nombre: string; equipos: number }
export interface SectorConCantidad { id: string; nombre: string; equipos: number; subsectores: SubsectorConCantidad[] }

export type TipoMantenimiento = 'correctivo' | 'preventivo';
export type Prioridad = 'urgente' | 'normal';

/** Datos propios de un correctivo (falla, causa, solución y tiempo de equipo parado). */
export interface DetalleCorrectivo {
  prioridad: Prioridad;
  /** Lo que se reportó: el síntoma ("pierde agua por el sello"). */
  falla: string;
  /** Por qué pasó. */
  causa: string;
  /** Qué se hizo para solucionarlo. */
  solucion: string;
  /** Horas que el equipo estuvo parado por la falla. */
  horasParada: number | null;
}

/** Una persona de Mantenimiento (administrador o técnico) que puede figurar en un trabajo. */
export interface Tecnico { id: string; nombre: string }

/** Una entrada del historial del equipo (lo que se hizo). */
export interface Intervencion {
  id: string;
  equipoId: string;
  fecha: FechaISO;
  tipo: TipoMantenimiento;
  descripcion: string;
  /** Quiénes lo hicieron (id del usuario, o null si ya no existe, y su nombre); si salió de una OT, con su horario. */
  tecnicos: ({ id: string | null; nombre: string } & Partial<Pick<TrabajoTecnico, 'fecha' | 'inicio' | 'fin'>>)[];
  /** Horas de trabajo (opcional). */
  horas: number | null;
  /** Repuestos usados, escritos. */
  repuestosUsados: string;
  /** Solo en correctivos. */
  correctivo: DetalleCorrectivo | null;
  /** Si salió de una orden de trabajo, su número (OT-0012). */
  otNumero: string | null;
  /** Horas que el equipo estuvo parado, también en los preventivos (en los correctivos es la misma que `correctivo.horasParada`). */
  horasParada: number | null;
  /** Quién revisó (jefe de taller) y quién aprobó (responsable) la OT de la que salió (vacío si no salió de una OT). */
  revisadoPor: string;
  aprobadoPor: string;
  /** Los repuestos que se usaron en la OT de la que salió, con su precio (para los costos del equipo). */
  repuestos: RepuestoUsado[];
}

/** Un repuesto usado en una OT: cuánto y a qué precio por unidad (null = no se anotó). */
export interface RepuestoUsado { codigo: string; descripcion: string; componente: string; cantidad: number; precio: number | null }

/** Un gasto de un servicio externo (un técnico de afuera, un taller, un service), cargado directo en el equipo. */
export interface GastoExterno {
  id: string;
  equipoId: string;
  fecha: FechaISO;
  proveedor: string;
  descripcion: string;
  monto: number;
}

/** Una parada de un equipo por mantenimiento (para la disponibilidad): sale del historial. */
export interface Parada { equipoId: string; fecha: FechaISO; tipo: TipoMantenimiento; horas: number }

// ---------- Etapa 2: rutinas preventivas y órdenes de trabajo ----------

/**
 * Un repuesto en una OT o una rutina: en qué componente del equipo va, qué repuesto (del Depósito, o escrito a mano: ese no descuenta
 * stock) y cuántos. En una OT terminada, cuánto se usó, cuánto se descontó y cuánto faltó descontar.
 */
export interface RepuestoLinea {
  /** Para la pantalla (no es el de la base). */
  id: string;
  componente: string;
  itemId: string | null;
  codigo: string;
  descripcion: string;
  /** Previsto (en la OT o la rutina). */
  cantidad: number;
  /** Al terminar: cuánto se usó de verdad (0 = no se cambió). */
  usado: number | null;
  descontado?: number | null;
  faltante?: number | null;
  /** El stock del Depósito ahora (null si es un repuesto escrito a mano). */
  stock?: number | null;
  /** Precio por unidad, en pesos, que se anota al terminar la OT (queda con el precio de ese día). Sin anotar = null. */
  precio?: number | null;
  ubicacion?: string | null;
}

/** Una tarea que pide anotar un valor: su unidad y su rango normal (los límites son opcionales). */
export interface Medicion {
  unidad: string;
  minimo: number | null;
  maximo: number | null;
}

/** Una tarea de una planilla o una rutina: se tilda, o además se anota un valor si tiene `medicion`. */
export interface TareaDef {
  texto: string;
  medicion: Medicion | null;
}

/** Una lista de tareas armada de antemano (ej.: "Bomba centrífuga – mensual"). Las rutinas la usan; si cambia, cambian todas. */
export interface PlanillaTareas {
  id: string;
  nombre: string;
  notas: string;
  tareas: TareaDef[];
}

/** La liberación del equipo al terminar una OT: los controles de entrega y quién lo recibió. */
export interface Liberacion {
  controles: { texto: string; ok: boolean }[];
  recibio: string;
}

/** El formato de la OT (uno por empresa, lo elige quien administra). */
export interface ConfigMantenimiento {
  /** Datos del registro de calidad que salen arriba a la derecha de la OT impresa (ej.: REG-MANT-01). */
  registroCodigo: string;
  registroVersion: string;
  registroVigencia: FechaISO | '';
  /** Controles de la liberación del equipo (vacío = la OT no tiene liberación). */
  controlesLiberacion: string[];
  /** Quién recibe el equipo (ej.: "Responsable de Producción"). */
  recibeLiberacion: string;
  /** Valor de la hora hombre de mantenimiento, en pesos, uno solo para todos (para los costos). Sin cargar = null. */
  costoHora: number | null;
  /** Cuándo les llegan las OT terminadas al jefe de taller y al responsable (fuera de ese horario esperan). */
  horarioRecepcion: HorarioRecepcion;
}

/** Un día de la semana en que se reciben OT terminadas (0 = domingo … 6 = sábado), con su horario "hh:mm". */
export interface FranjaRecepcion { dia: number; desde: string; hasta: string }
export interface HorarioRecepcion { dias: FranjaRecepcion[] }

/**
 * En qué parte del circuito está la OT (quién tiene que hacer algo con ella):
 * por_derivar (el responsable la manda al jefe de taller) → por_asignar (el jefe la asigna) → asignada (la hacen los técnicos) →
 * a_revisar (la revisa el jefe) → para_aprobar (la aprueba el responsable; recién ahí va al historial y descuenta repuestos) → aprobada.
 */
export type EtapaOT = 'por_derivar' | 'por_asignar' | 'asignada' | 'a_revisar' | 'para_aprobar' | 'aprobada';

/** Un paso del recorrido de la OT: quién hizo qué y cuándo ("aaaa-mm-ddThh:mm", hora de la empresa). */
export interface PasoOT { cuando: string; quien: string; accion: string; comentario: string }

/** Los perfiles del circuito: el responsable (el administrador de Mantenimiento), el jefe de taller y el técnico. */
export type RolMantenimiento = 'responsable' | 'jefe' | 'tecnico' | 'consulta';

export interface Rutina {
  id: string;
  equipoId: string;
  tareas: TareaDef[];
  /** La planilla de donde salen sus tareas (si cambia la planilla, cambian las tareas). */
  planillaId: string | null;
  frecuenciaDias: number;
  proximaFecha: FechaISO;
  /** Con cuántos días de anticipación se avisa. */
  avisoDias: number;
  responsableId: string | null;
  responsable: string;
  activa: boolean;
  repuestos: RepuestoLinea[];
}

export type TipoOT = 'preventiva' | 'correctiva';
export type EstadoOT = 'pendiente' | 'en_curso' | 'terminada';

/** Un técnico que trabajó en la OT: cuándo terminó y de qué hora a qué hora (las horas hombre se calculan). */
export interface TrabajoTecnico {
  usuarioId: string | null;
  nombre: string;
  /** Fecha en que terminó (vacío = sin anotar). */
  fecha: FechaISO | '';
  /** "HH:MM" (vacío = sin anotar). */
  inicio: string;
  fin: string;
}

export interface TareaOT { id: string; texto: string; hecha: boolean; medicion: Medicion | null; valor: number | null }

export interface OrdenTrabajo {
  id: string;
  numero: number;
  tipo: TipoOT;
  equipoId: string;
  rutinaId: string | null;
  fechaProgramada: FechaISO;
  asignadoId: string | null;
  asignado: string;
  estado: EstadoOT;
  /** Cuándo tocaron "Empezar" (momento ISO). */
  empezadaAt: string | null;
  fechaCierre: FechaISO | null;
  observaciones: string;
  horas: number | null;
  /** Con cuántos días se avisa (los de su rutina; 3 en las correctivas). */
  avisoDias: number;
  tareas: TareaOT[];
  repuestos: RepuestoLinea[];
  tecnicos: TrabajoTecnico[];
  /** Solo en correctivas: prioridad, falla, causa, solución y tiempo parado. */
  correctivo: DetalleCorrectivo | null;
  /** La liberación del equipo (en las terminadas, si el formato la pide). */
  liberacion: Liberacion | null;
  /** Solo en preventivas: horas que el equipo estuvo parado (en las correctivas va en `correctivo`). */
  horasParada: number | null;
  /** En qué parte del circuito está. */
  etapa: EtapaOT;
  /** Los técnicos asignados (id del usuario, o null si ya no existe, y su nombre). */
  asignados: { id: string | null; nombre: string }[];
  /** El recorrido: quién la derivó, asignó, terminó, revisó, devolvió y aprobó. */
  pasos: PasoOT[];
  /** Cuándo la terminó el técnico ("aaaa-mm-ddThh:mm"): de ahí sale cuándo les llega para revisar. */
  terminadaEn: string | null;
}

/** Al aprobar: qué OT nuevas se generan (van al jefe de taller). */
export interface AprobacionInput {
  /** Una OT con las tareas que quedaron en NO (preventivas). */
  otPendientes: boolean;
  /** Una OT correctiva para revisar los valores fuera de rango. */
  otPorValores: boolean;
  /** Tareas para una OT nueva, una por renglón (en las correctivas, lo pendiente que escribió el técnico en las observaciones). */
  tareasNuevas: string;
}

export interface ResultadoAprobacion { pendientes: number | null; aMano: number | null; valores: number | null; descontados: number; faltantes: number }

/** La OT correctiva que carga el técnico después de hacer el trabajo (llamado de guardia): nace terminada, para revisar. */
export interface CorrectivaCargadaInput {
  equipoId: string;
  fecha: FechaISO;
  prioridad: Prioridad;
  falla: string;
  causa: string;
  /** Trabajo realizado. */
  solucion: string;
  horas: number | null;
  horasParada: number | null;
  /** Lo que quedó pendiente. */
  observaciones: string;
  liberacion: Liberacion | null;
  tecnicos: TrabajoTecnico[];
  /** Los repuestos usados (`usado` = cuánto se usó), con su precio. */
  repuestos: Pick<RepuestoLinea, 'componente' | 'itemId' | 'codigo' | 'descripcion' | 'cantidad' | 'usado' | 'precio'>[];
}

export interface RutinaInput {
  id: string | null;
  equipoId: string;
  tareas: TareaDef[];
  planillaId: string | null;
  frecuenciaDias: number;
  proximaFecha: FechaISO;
  avisoDias: number;
  responsableId: string | null;
  activa: boolean;
  repuestos: Pick<RepuestoLinea, 'componente' | 'itemId' | 'codigo' | 'descripcion' | 'cantidad'>[];
}

export interface CorrectivaInput {
  equipoId: string;
  fecha: FechaISO;
  asignadoId: string | null;
  prioridad: Prioridad;
  falla: string;
  tareas: TareaDef[];
  repuestos: Pick<RepuestoLinea, 'componente' | 'itemId' | 'codigo' | 'descripcion' | 'cantidad'>[];
}

export interface CierreInput {
  fecha: FechaISO;
  observaciones: string;
  /** Las horas en total, si no se cargaron los horarios de los técnicos. */
  horas: number | null;
  causa: string;
  solucion: string;
  horasParada: number | null;
  /** Pasar lo que quedó sin hacer a una OT nueva. */
  otPendientes: boolean;
  /** Crear una OT correctiva para revisar los valores fuera de rango. */
  otPorValores: boolean;
  liberacion: Liberacion | null;
  tecnicos: TrabajoTecnico[];
  repuestos: Pick<RepuestoLinea, 'componente' | 'itemId' | 'codigo' | 'descripcion' | 'cantidad' | 'usado' | 'precio'>[];
}

export interface ResultadoCierre { siguiente: number | null; pendientes: number | null; valores: number | null; descontados: number; faltantes: number }

/** Repuesto crítico de un equipo: un repuesto del Depósito, con su stock. */
export interface RepuestoCritico {
  equipoId: string;
  itemId: string;
  codigo: string;
  descripcion: string;
  /** Cuántos conviene tener siempre para este equipo. */
  cantidad: number;
  nota: string;
  stock: number | null;
  ubicacion: string | null;
  deposito: string | null;
}

export interface Manual {
  id: string;
  equipoId: string;
  nombre: string;
  /** Dirección para abrirlo (la sirve la app, que revisa que la persona pueda verlo). */
  url: string;
  tamanioBytes: number | null;
  subidoEl: FechaISO;
}

/** Todo lo de un equipo junto (su ficha). */
export interface FichaDeEquipo {
  equipo: Equipo;
  padre: Equipo | null;
  subEquipos: EquipoDeLista[];
  intervenciones: Intervencion[];
  /** El historial de sus sub-equipos (para verlo junto con el del principal). */
  intervencionesSub: Intervencion[];
  repuestos: RepuestoCritico[];
  manuales: Manual[];
  /** Sus rutinas preventivas y sus órdenes de trabajo abiertas. */
  rutinas: Rutina[];
  ordenes: OrdenTrabajo[];
  /** Los valores anotados en sus OT terminadas (de la más vieja a la más nueva), para ver cómo cambian. */
  mediciones: ValorMedido[];
  /** Los gastos de servicios externos del equipo y sus sub-equipos (para los costos). */
  gastos: GastoExterno[];
}

/** Un valor anotado en una OT terminada. */
export interface ValorMedido extends Medicion { tarea: string; valor: number; fecha: FechaISO; ot: number }

/** Un repuesto del Depósito para elegir (buscador). */
export interface RepuestoParaElegir { id: string; codigo: string; descripcion: string; stock: number | null; deposito: string | null }

/** Lo que se guarda de un equipo (null en id = nuevo). */
export interface EquipoInput {
  id: string | null;
  codigo: string;
  nombre: string;
  /** El sector y el sub-sector por su nombre (vacío = sin sector): si todavía no existen, se crean. */
  sector: string;
  subsector: string;
  etiquetas: string[];
  marca: string;
  modelo: string;
  numeroSerie: string;
  ubicacion: string;
  critico: boolean;
  notas: string;
  padreId: string | null;
}

export interface IntervencionInput {
  id: string | null;
  equipoId: string;
  fecha: FechaISO;
  tipo: TipoMantenimiento;
  descripcion: string;
  /** Los usuarios técnicos elegidos. */
  tecnicos: string[];
  horas: number | null;
  repuestosUsados: string;
  correctivo: DetalleCorrectivo | null;
  /** Solo en preventivos: horas que el equipo estuvo parado (en los correctivos va en `correctivo`). */
  horasParada?: number | null;
}

export interface DuplicarInput {
  id: string;
  codigo: string;
  nombre: string;
  numeroSerie: string;
}
