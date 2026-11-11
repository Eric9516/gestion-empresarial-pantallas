import { useSyncExternalStore } from 'react';
import { crearDatosDemo, PERSONAS } from './datosDemo';
import { aplicarPlanillas, configInicial, normalizarHorario, sincronizarOrdenes } from './preventivo';
import type { DatosMantenimiento, EtapaOT, OrdenTrabajo } from './tipos';

// MODO DE EJEMPLO: guarda los datos del módulo en este navegador (no en la base).
// Lo usan solo los hooks use*.ts de esta carpeta. Cuando exista la base de datos, esos hooks
// pasan a pedir y guardar ahí, y este archivo (junto con datosDemo.ts) se borra.
// Se guarda en el navegador para que lo que se cargue o importe no se pierda al recargar la
// página mientras se prueba. Los PDF de manuales no se guardan (solo duran con la página abierta).

const CLAVE = 'mantenimiento-demo-v3';

export function nuevoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function etapaVieja(o: OrdenTrabajo): EtapaOT {
  if (o.estado === 'terminada') return 'aprobada';
  if (o.tipo === 'preventiva' && o.estado === 'pendiente') return 'por_derivar';
  return o.asignadoA ? 'asignada' : 'por_asignar';
}

function asignadosPorNombre(nombres: string): string[] {
  return nombres.split(/[,;]/).map(n => n.trim().toLowerCase()).filter(Boolean)
    .map(n => PERSONAS.find(p => p.nombre.toLowerCase() === n)?.id).filter((x): x is string => !!x);
}

function leerGuardado(): DatosMantenimiento | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as DatosMantenimiento;
    if (!Array.isArray(datos.equipos)) return null;
    // Los datos guardados con una versión anterior se completan con los campos nuevos (no se pierde nada).
    return {
      ...datos,
      sectores: datos.sectores ?? [],
      subsectores: datos.subsectores ?? [],
      ordenSectores: datos.ordenSectores ?? [],
      consumos: datos.consumos ?? [],
      planillas: datos.planillas ?? [],
      gastosExternos: datos.gastosExternos ?? [],
      config: { ...configInicial(), ...(datos.config ?? {}), horarioRecepcion: normalizarHorario(datos.config?.horarioRecepcion) },
      personas: datos.personas?.length ? datos.personas : PERSONAS,
      equipos: datos.equipos.map(e => ({ ...e, padreId: e.padreId ?? null, subsector: e.subsector ?? '' })),
      intervenciones: datos.intervenciones.map(i => ({ ...i, repuestos: i.repuestos ?? [], tareas: i.tareas ?? [], correctivo: i.correctivo ?? null, otNumero: i.otNumero ?? null, tecnicos: i.tecnicos ?? [], liberacion: i.liberacion ?? null })),
      rutinas: datos.rutinas.map(r => ({ ...r, repuestos: r.repuestos ?? [], planillaId: r.planillaId ?? null, mediciones: r.mediciones ?? [] })),
      ordenes: datos.ordenes.map(o => ({
        ...o, tareasHechas: o.tareasHechas ?? [], repuestos: o.repuestos ?? [], mediciones: o.mediciones ?? [], valores: o.valores ?? [], tecnicos: o.tecnicos ?? [], liberacion: o.liberacion ?? null,
        correctivo: o.correctivo ?? (o.tipo === 'correctiva' ? { prioridad: 'normal', falla: '', causa: '', solucion: '', horasParada: null } : null),
        // OT guardadas antes del circuito derivar → asignar → revisar → aprobar.
        etapa: o.etapa ?? etapaVieja(o), asignados: o.asignados ?? asignadosPorNombre(o.asignadoA), pasos: o.pasos ?? [], terminadaEn: o.terminadaEn ?? null, cierre: o.cierre ?? null,
      })),
    };
  } catch {
    return null;
  }
}

function guardar(datos: DatosMantenimiento) {
  try {
    // Las direcciones de los PDF son temporales: no sirven después de recargar.
    localStorage.setItem(CLAVE, JSON.stringify({ ...datos, manuales: datos.manuales.map(m => ({ ...m, url: null })) }));
  } catch {
    // Sin lugar o sin permiso: sigue funcionando en memoria.
  }
}

let datos: DatosMantenimiento | null = null;
const oyentes = new Set<() => void>();

// Después de cada cambio: las rutinas toman las tareas de su planilla y cada rutina queda con su OT al día.
function conOrdenesAlDia(d: DatosMantenimiento): DatosMantenimiento {
  const rutinas = aplicarPlanillas(d.rutinas, d.planillas);
  const ordenes = sincronizarOrdenes(rutinas, d.ordenes, nuevoId);
  return ordenes === d.ordenes && rutinas === d.rutinas ? d : { ...d, rutinas, ordenes };
}

export function obtenerDatos(): DatosMantenimiento {
  if (!datos) datos = conOrdenesAlDia(leerGuardado() ?? crearDatosDemo());
  return datos;
}

/** Cambia los datos (siempre devolviendo un objeto nuevo) y avisa a las pantallas. */
export function actualizarDatos(cambio: (d: DatosMantenimiento) => DatosMantenimiento) {
  datos = conOrdenesAlDia(cambio(obtenerDatos()));
  guardar(datos);
  oyentes.forEach(o => o());
}

/** Deja el módulo vacío, para cargar o importar solo datos propios (en este navegador). */
export function vaciarDatosDemo() {
  actualizarDatos(() => ({ sectores: [], subsectores: [], ordenSectores: [], equipos: [], intervenciones: [], repuestosCriticos: [], manuales: [], rutinas: [], ordenes: [], consumos: [], planillas: [], gastosExternos: [], config: configInicial(), personas: PERSONAS }));
}

/** Vuelve a los datos de ejemplo del principio (borra lo cargado en este navegador). */
export function restablecerDatosDemo() {
  actualizarDatos(() => crearDatosDemo());
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

export function useDatosDemo(): DatosMantenimiento {
  return useSyncExternalStore(suscribir, obtenerDatos, obtenerDatos);
}

/** Imita la forma de las mutaciones de la app (mutateAsync / isPending) para que el cambio a la base sea directo. */
export function mutacionDemo<A, R = void>(fn: (args: A) => R) {
  return {
    isPending: false,
    mutateAsync: async (args: A): Promise<R> => fn(args),
  };
}
