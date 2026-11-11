import { actualizarDatos, mutacionDemo, nuevoId, obtenerDatos, useDatosDemo } from './almacenDemo';
import { paso } from './flujo';
import {
  aprobarOrden, armarCorrectivaCargada, numeroOT, terminarOrden, ultimoNumeroOT, type CorrectivaCargada, type DatosCierre, type OpcionesAprobacion,
} from './preventivo';
import type { ConfigMantenimiento, DetalleCorrectivo, EstadoOT, OrdenTrabajo, PersonaMantenimiento, PlanillaTareas, RepuestoLinea, RutinaPreventiva } from './tipos';

// Rutinas preventivas y órdenes de trabajo (OT).
// HOY: datos de ejemplo (almacenDemo.ts), que además genera solo la OT de cada rutina.
// PARA ERIC: en la base, esa generación conviene hacerla del lado del servidor (una función que
// corre al guardar una rutina o al cerrar una OT, con la misma regla que preventivo.ts), así no
// depende de que alguien abra la pantalla.

const sinCarga = { isLoading: false, isError: false } as const;

export function useRutinasQuery() {
  const d = useDatosDemo();
  return { data: d.rutinas, ...sinCarga };
}

export function useOrdenesQuery() {
  const d = useDatosDemo();
  return { data: d.ordenes, ...sinCarga };
}

export type RutinaInput = Omit<RutinaPreventiva, 'id'> & { id?: string };

export function useGuardarRutina() {
  return mutacionDemo((r: RutinaInput) => {
    actualizarDatos(d => r.id
      ? { ...d, rutinas: d.rutinas.map(x => (x.id === r.id ? { ...x, ...r, id: x.id } : x)) }
      : { ...d, rutinas: [...d.rutinas, { ...r, id: nuevoId() }] });
  });
}

export function useEliminarRutina() {
  return mutacionDemo((id: string) => {
    // Su OT pendiente se quita sola; las terminadas quedan en el historial.
    actualizarDatos(d => ({ ...d, rutinas: d.rutinas.filter(x => x.id !== id) }));
  });
}

/**
 * El técnico carga una OT correctiva hecha de urgencia (llamado de guardia), con el trabajo ya hecho.
 * Queda "para revisar": la revisa el jefe de taller y la aprueba el responsable. Devuelve su número.
 */
export function useCargarCorrectiva() {
  return mutacionDemo(({ datos, cuando, quien }: { datos: CorrectivaCargada; cuando: string; quien: PersonaMantenimiento }): string => {
    const numero = numeroOT(ultimoNumeroOT(obtenerDatos().ordenes) + 1);
    actualizarDatos(d => ({ ...d, ordenes: [...d.ordenes, armarCorrectivaCargada(datos, nuevoId(), numero, cuando, quien)] }));
    return numero;
  });
}

// ---------- Circuito: derivar → asignar → (técnico) terminar → revisar → aprobar ----------
// PARA ERIC: cada paso lo puede hacer solo el rol que corresponde (ver NOTAS-PARA-ERIC.md) y conviene
// validarlo en la base. Los avisos a cada uno (y al celular o al mail) salen de estos cambios de etapa.

function cambiarOT(id: string, cambio: (o: OrdenTrabajo) => OrdenTrabajo | null) {
  actualizarDatos(d => {
    let hubo = false;
    const ordenes = d.ordenes.map(o => {
      if (o.id !== id) return o;
      const n = cambio(o);
      if (!n) return o;
      hubo = true;
      return n;
    });
    return hubo ? { ...d, ordenes } : d;
  });
}

/** El responsable manda una o varias OT al jefe de taller. */
export function useDerivarOrdenes() {
  return mutacionDemo(({ ids, cuando, quien }: { ids: string[]; cuando: string; quien: PersonaMantenimiento }) => {
    actualizarDatos(d => ({
      ...d,
      ordenes: d.ordenes.map(o => (ids.includes(o.id) && o.etapa === 'por_derivar'
        ? { ...o, etapa: 'por_asignar', pasos: [...o.pasos, paso(cuando, quien, 'Derivó al jefe de taller')] }
        : o)),
    }));
  });
}

/** El jefe de taller asigna (o reasigna) la OT a uno o varios técnicos. */
export function useAsignarOrden() {
  return mutacionDemo(({ id, tecnicos, cuando, quien }: { id: string; tecnicos: PersonaMantenimiento[]; cuando: string; quien: PersonaMantenimiento }) => {
    if (!tecnicos.length) throw new Error('Elegí al menos un técnico.');
    const nombres = tecnicos.map(t => t.nombre).join(', ');
    cambiarOT(id, o => (o.estado === 'terminada' ? null : {
      ...o, etapa: 'asignada', asignados: tecnicos.map(t => t.id), asignadoA: nombres,
      pasos: [...o.pasos, paso(cuando, quien, `${o.etapa === 'asignada' ? 'Reasignó' : 'Asignó'} a ${nombres}`)],
    }));
  });
}

/** El técnico termina la OT: queda para revisar (todavía no va al historial). */
export function useTerminarOrden() {
  return mutacionDemo(({ id, datos, cuando, quien }: { id: string; datos: DatosCierre; cuando: string; quien: PersonaMantenimiento }) => {
    actualizarDatos(d => {
      const ot = d.ordenes.find(o => o.id === id);
      if (!ot || ot.estado === 'terminada') return d;
      const rutina = d.rutinas.find(r => r.id === ot.rutinaId);
      const r = terminarOrden(ot, datos, rutina, nuevoId, cuando, quien);
      return {
        ...d,
        ordenes: d.ordenes.map(o => (o.id === id ? r.ot : o)),
        rutinas: r.rutina ? d.rutinas.map(x => (x.id === r.rutina!.id ? r.rutina! : x)) : d.rutinas,
      };
    });
  });
}

/** El jefe de taller revisó la OT y la pasa al responsable para que la apruebe. */
export function usePasarAAprobacion() {
  return mutacionDemo(({ id, cuando, quien, comentario }: { id: string; cuando: string; quien: PersonaMantenimiento; comentario: string }) => {
    cambiarOT(id, o => (o.etapa !== 'a_revisar' ? null : { ...o, etapa: 'para_aprobar', pasos: [...o.pasos, paso(cuando, quien, 'Revisó y pasó a aprobación', comentario)] }));
  });
}

/** El jefe de taller o el responsable devuelven la OT al técnico, con un comentario de qué falta. */
export function useDevolverOrden() {
  return mutacionDemo(({ id, cuando, quien, comentario }: { id: string; cuando: string; quien: PersonaMantenimiento; comentario: string }) => {
    if (!comentario.trim()) throw new Error('Escribí qué tiene que corregir o completar.');
    cambiarOT(id, o => (o.etapa !== 'a_revisar' && o.etapa !== 'para_aprobar' ? null : {
      ...o, etapa: 'asignada', estado: 'en_curso', terminadaEn: null,
      pasos: [...o.pasos, paso(cuando, quien, 'Devolvió al técnico', comentario.trim())],
    }));
  });
}

/**
 * El responsable aprueba la OT: va al historial del equipo y se descuentan los repuestos. Si quedaron tareas
 * sin hacer o valores fuera de rango, se generan OT nuevas para el jefe de taller. Devuelve sus números.
 */
export function useAprobarOrden() {
  return mutacionDemo(({ id, opciones, cuando, quien }: { id: string; opciones: OpcionesAprobacion; cuando: string; quien: PersonaMantenimiento }): string[] => {
    let nuevas: string[] = [];
    actualizarDatos(d => {
      const ot = d.ordenes.find(o => o.id === id);
      if (!ot || ot.etapa !== 'para_aprobar') return d;
      const r = aprobarOrden(ot, opciones, nuevoId, ultimoNumeroOT(d.ordenes), cuando, quien);
      nuevas = r.nuevas.map(x => x.numero);
      return {
        ...d,
        ordenes: [...d.ordenes.map(o => (o.id === id ? r.ot : o)), ...r.nuevas],
        intervenciones: [...d.intervenciones, r.intervencion],
        consumos: [...d.consumos, ...r.consumos],
      };
    });
    return nuevas;
  });
}

// ---------- Opciones del módulo ----------
// PARA ERIC: una fila por empresa (tabla mantenimiento_config o dentro de la configuración que ya existe).
// Solo el admin de Mantenimiento las cambia.

export function useConfigMantenimiento(): ConfigMantenimiento {
  return useDatosDemo().config;
}

export function useGuardarConfigMantenimiento() {
  return mutacionDemo((c: ConfigMantenimiento) => {
    actualizarDatos(d => ({ ...d, config: c }));
  });
}

// ---------- Planillas de tareas ----------
// PARA ERIC: tabla planillas_tareas (id, nombre, notas) + planilla_tareas_items (planilla_id, orden, texto,
// unidad, minimo, maximo; sin unidad = se tilda). La rutina guarda planilla_id; al cambiar la planilla se
// actualizan las rutinas que la usan y sus OT pendientes (aplicarPlanillas en preventivo.ts).

export function usePlanillasQuery() {
  const d = useDatosDemo();
  return { data: d.planillas, ...sinCarga };
}

export type PlanillaInput = Omit<PlanillaTareas, 'id'> & { id?: string };

/** Guardar una planilla (nueva o cambiada). Devuelve su id. Las rutinas que la usan se actualizan solas. */
export function useGuardarPlanilla() {
  return mutacionDemo((p: PlanillaInput): string => {
    const id = p.id ?? nuevoId();
    actualizarDatos(d => {
      const mismo = d.planillas.find(x => x.id !== id && x.nombre.trim().toLowerCase() === p.nombre.trim().toLowerCase());
      if (mismo) throw new Error('Ya hay una planilla con ese nombre.');
      return p.id
        ? { ...d, planillas: d.planillas.map(x => (x.id === id ? { ...x, ...p, id } : x)) }
        : { ...d, planillas: [...d.planillas, { ...p, id }] };
    });
    return id;
  });
}

/** Borrar una planilla: las rutinas que la usaban se quedan con una copia de sus tareas. */
export function useEliminarPlanilla() {
  return mutacionDemo((id: string) => {
    actualizarDatos(d => ({
      ...d,
      planillas: d.planillas.filter(x => x.id !== id),
      rutinas: d.rutinas.map(r => (r.planillaId === id ? { ...r, planillaId: null } : r)),
    }));
  });
}

/** Anotar el valor de una medición en una OT abierta. Con valor, la tarea queda tildada. */
export function useAnotarValor() {
  return mutacionDemo(({ id, indice, valor }: { id: string; indice: number; valor: number | null }) => {
    actualizarDatos(d => ({
      ...d,
      ordenes: d.ordenes.map(o => {
        if (o.id !== id || o.estado === 'terminada') return o;
        const valores = [...(o.valores ?? [])];
        while (valores.length <= indice) valores.push(null);
        valores[indice] = valor;
        const tareasHechas = [...(o.tareasHechas ?? [])];
        while (tareasHechas.length <= indice) tareasHechas.push(false);
        if (valor != null) tareasHechas[indice] = true;
        return { ...o, valores, tareasHechas };
      }),
    }));
  });
}

/** Cambiar los repuestos previstos de una OT abierta. */
export function useGuardarRepuestosOrden() {
  return mutacionDemo(({ id, repuestos }: { id: string; repuestos: RepuestoLinea[] }) => {
    actualizarDatos(d => ({ ...d, ordenes: d.ordenes.map(o => (o.id === id && o.estado !== 'terminada' ? { ...o, repuestos } : o)) }));
  });
}

/** Cambiar prioridad o falla reportada de una OT correctiva abierta. */
export function useGuardarDetalleCorrectivo() {
  return mutacionDemo(({ id, cambios }: { id: string; cambios: Partial<DetalleCorrectivo> }) => {
    actualizarDatos(d => ({
      ...d,
      ordenes: d.ordenes.map(o => (o.id === id && o.correctivo ? { ...o, correctivo: { ...o.correctivo, ...cambios } } : o)),
    }));
  });
}

export function useCambiarEstadoOrden() {
  return mutacionDemo(({ id, estado }: { id: string; estado: Exclude<EstadoOT, 'terminada'> }) => {
    actualizarDatos(d => ({ ...d, ordenes: d.ordenes.map(o => (o.id === id ? { ...o, estado } : o)) }));
  });
}

/** Tildar o destildar las tareas hechas de una OT abierta (se guarda en el momento). */
export function useMarcarTareas() {
  return mutacionDemo(({ id, tareasHechas }: { id: string; tareasHechas: boolean[] }) => {
    actualizarDatos(d => ({ ...d, ordenes: d.ordenes.map(o => (o.id === id && o.estado !== 'terminada' ? { ...o, tareasHechas } : o)) }));
  });
}

/** Mover una OT a otra fecha (por ejemplo, si no se pudo hacer ese día). En una preventiva, mueve la rutina. */
export function useReprogramarOrden() {
  return mutacionDemo(({ id, fecha }: { id: string; fecha: string }) => {
    actualizarDatos(d => {
      const ot = d.ordenes.find(o => o.id === id);
      if (!ot) return d;
      return {
        ...d,
        ordenes: d.ordenes.map(o => (o.id === id ? { ...o, fechaProgramada: fecha } : o)),
        rutinas: d.rutinas.map(r => (r.id === ot.rutinaId && ot.estado !== 'terminada' ? { ...r, proximaFecha: fecha } : r)),
      };
    });
  });
}

export function useEliminarOrden() {
  return mutacionDemo((id: string) => {
    actualizarDatos(d => ({ ...d, ordenes: d.ordenes.filter(o => o.id !== id) }));
  });
}
