import { createContext, useContext } from 'react';
import type {
  AprobacionInput, CierreInput, ConfigMantenimiento, CorrectivaCargadaInput, CorrectivaInput, DuplicarInput, EquipoDeLista, EquipoInput, FichaDeEquipo, GastoExterno,
  IntervencionInput, OrdenTrabajo, Parada, PlanillaTareas, RepuestoLinea, RepuestoParaElegir, ResultadoAprobacion, ResultadoCierre, RolMantenimiento, Rutina, RutinaInput,
  Sector, Tecnico,
} from './tipos';

// Lo que las pantallas de Mantenimiento leen y hacen. Lo pone la app de Next (EquiposEnNext) con sus acciones del servidor; las pantallas
// del socio usaban unos ganchos use*() con datos de ejemplo, y acá esos ganchos pasan a ser este servicio.
// Cada cambio, si falla, lanza un Error con el mensaje para la persona; si sale bien, la lista se vuelve a leer (y la ficha abierta también).

export interface ServicioDeMantenimiento {
  /** undefined mientras se lee. */
  equipos: EquipoDeLista[] | undefined;
  sectores: Sector[];
  tecnicos: Tecnico[];
  isError: boolean;
  /** Puede crear y editar equipos, sectores, repuestos críticos y manuales, y borrar el historial. */
  esAdmin: boolean;
  /** Puede registrar y corregir trabajos en el historial (técnico, jefe de taller o responsable). */
  trabaja: boolean;
  /** Su perfil en el circuito de las OT (el dueño y el administrador son el responsable). */
  rol: RolMantenimiento;
  /** Asigna y revisa las OT: el jefe de taller (y el responsable, para que nada se trabe si no hay jefe). */
  jefe: boolean;
  /** Cambia con cada cambio guardado: lo que se lee aparte (la ficha) se vuelve a pedir. */
  revision: number;

  buscar: (consulta: string) => Promise<{ id: string; motivos: string[] }[]>;
  ficha: (id: string) => Promise<FichaDeEquipo | null>;

  /** Devuelve el id del equipo. */
  guardarEquipo: (e: EquipoInput) => Promise<string>;
  eliminarEquipo: (id: string) => Promise<void>;
  /** Devuelve el id del nuevo. */
  duplicarEquipo: (d: DuplicarInput) => Promise<string>;

  crearSector: (nombre: string, padreId: string | null) => Promise<void>;
  renombrarSector: (id: string, nombre: string) => Promise<void>;
  eliminarSector: (id: string) => Promise<void>;
  moverSector: (id: string, delta: -1 | 1) => Promise<void>;

  buscarRepuestos: (texto: string) => Promise<RepuestoParaElegir[]>;
  guardarRepuesto: (r: { equipoId: string; itemId: string; cantidad: number; nota: string; nuevo: boolean }) => Promise<void>;
  quitarRepuesto: (equipoId: string, itemId: string) => Promise<void>;

  /** `avance`: el porcentaje subido (0 a 100) y, cuando ya llegó todo, 'optimizando' (el servidor lo reacomoda para verlo por partes). */
  subirManual: (equipoId: string, archivo: File, avance?: (p: number | 'optimizando') => void) => Promise<void>;
  quitarManual: (id: string) => Promise<void>;

  guardarIntervencion: (i: IntervencionInput) => Promise<void>;
  eliminarIntervencion: (id: string) => Promise<void>;

  // ---------- Etapa 2: preventivo y órdenes de trabajo ----------
  /** Quien está usando la app (para "mis OT"). */
  usuarioId: string;
  /** Todas las rutinas y las OT (abiertas y terminadas de los últimos meses); undefined donde no se leen o mientras se leen. */
  rutinas: Rutina[] | undefined;
  ordenes: OrdenTrabajo[] | undefined;
  /** Para la OT impresa: el nombre de la empresa y su logo (data:…, vacío mientras llega). */
  empresa: { nombre: string; logo: string };
  /** Una OT al día (con el stock de ahora). */
  orden: (id: string) => Promise<OrdenTrabajo | null>;
  guardarRutina: (r: RutinaInput) => Promise<void>;
  eliminarRutina: (id: string) => Promise<void>;
  /** Devuelve el número de la OT. */
  crearCorrectiva: (o: CorrectivaInput) => Promise<number>;
  /** Una tarea (o todas, sin tarea). */
  marcarTareas: (otId: string, tareaId: string | null, hecha: boolean) => Promise<void>;
  empezarOt: (id: string) => Promise<void>;
  reprogramarOt: (id: string, fecha: string) => Promise<void>;
  guardarRepuestosOt: (id: string, repuestos: RepuestoLinea[]) => Promise<void>;
  guardarFallaOt: (id: string, prioridad: 'normal' | 'urgente', falla: string) => Promise<void>;
  cerrarOt: (id: string, d: CierreInput) => Promise<ResultadoCierre>;
  eliminarOt: (id: string) => Promise<void>;

  // ---------- Etapa 3: planillas, mediciones, liberación y formato de la OT ----------
  planillas: PlanillaTareas[];
  config: ConfigMantenimiento;
  /** Devuelve cuántas rutinas que la usan se actualizaron. */
  guardarPlanilla: (p: Omit<PlanillaTareas, 'id'> & { id: string | null }) => Promise<number>;
  eliminarPlanilla: (id: string) => Promise<void>;
  guardarConfig: (c: ConfigMantenimiento) => Promise<void>;
  /** El valor medido de una tarea (null = borrarlo). */
  anotarValor: (otId: string, tareaId: string, valor: number | null) => Promise<void>;

  // ---------- Del socio (11/11/2026): disponibilidad, costos y el circuito de las OT ----------
  /** Las paradas por mantenimiento de todos los equipos entre dos fechas (para el Inicio). */
  paradas: (desde: string, hasta: string) => Promise<Parada[]>;
  guardarGasto: (g: Omit<GastoExterno, 'id'>) => Promise<void>;
  eliminarGasto: (id: string) => Promise<void>;
  /** El técnico la termina: queda para revisar. Devuelve el número de la siguiente de la rutina. */
  terminarOt: (id: string, d: CierreInput) => Promise<number | null>;
  /** Devuelve el número de la OT. */
  cargarCorrectiva: (d: CorrectivaCargadaInput) => Promise<number>;
  /** Devuelve cuántas derivó. */
  derivarOts: (ids: string[]) => Promise<number>;
  asignarOt: (id: string, usuarios: string[]) => Promise<void>;
  pasarAAprobacion: (id: string, comentario: string) => Promise<void>;
  devolverOt: (id: string, comentario: string) => Promise<void>;
  aprobarOt: (id: string, op: AprobacionInput) => Promise<ResultadoAprobacion>;
}

export const ContextoDeMantenimiento = createContext<ServicioDeMantenimiento | null>(null);

export function useMantenimiento(): ServicioDeMantenimiento {
  const s = useContext(ContextoDeMantenimiento);
  if (!s) throw new Error('Falta ContextoDeMantenimiento');
  return s;
}
