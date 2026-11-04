import { actualizarDatos, mutacionDemo, nuevoId, obtenerDatos, useDatosDemo } from './almacenDemo';
import { sumarDias } from './fechas';
import { cerrarOrden, medicionesDe, numeroCorto, numeroOT, textoRango, ultimoNumeroOT, type DatosCierre } from './preventivo';
import type { ConfigMantenimiento, DetalleCorrectivo, EstadoOT, OrdenTrabajo, PlanillaTareas, Prioridad, RepuestoLinea, RutinaPreventiva } from './tipos';

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

/** Una OT correctiva a mano (algo que se rompió o hay que hacer una sola vez). */
export function useCrearOrdenCorrectiva() {
  return mutacionDemo((o: Pick<OrdenTrabajo, 'equipoId' | 'fechaProgramada' | 'tareas' | 'asignadoA' | 'repuestos'> & { prioridad: Prioridad; falla: string }): string => {
    const numero = numeroOT(ultimoNumeroOT(obtenerDatos().ordenes) + 1);
    actualizarDatos(d => ({
      ...d,
      ordenes: [...d.ordenes, {
        id: nuevoId(), numero, tipo: 'correctiva', equipoId: o.equipoId, rutinaId: null, fechaProgramada: o.fechaProgramada,
        tareas: o.tareas, tareasHechas: [], asignadoA: o.asignadoA, estado: 'pendiente', fechaCierre: null, observaciones: '',
        horas: null, repuestosUsados: '', repuestos: o.repuestos,
        correctivo: { prioridad: o.prioridad, falla: o.falla, causa: '', solucion: '', horasParada: null }, mediciones: [], valores: [], tecnicos: [], liberacion: null,
      }],
    }));
    return numero;
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

/**
 * Terminar una OT: queda en el historial del equipo (con qué tareas se hicieron y cuáles no, y los valores
 * anotados) y, si es preventiva, se genera la siguiente. Con `pendientesEnOtNueva`, las tareas que faltaron
 * pasan a una OT correctiva nueva para el día siguiente; con `correctivaPorValores`, los valores fuera de
 * rango generan otra OT correctiva para revisarlos. Devuelve los números de las OT que se crearon.
 */
export function useCerrarOrden() {
  return mutacionDemo(({ id, datos, pendientesEnOtNueva, correctivaPorValores }: { id: string; datos: DatosCierre; pendientesEnOtNueva?: boolean; correctivaPorValores?: boolean }): { pendientes: string | null; valores: string | null } => {
    let otNueva: string | null = null;
    let otValores: string | null = null;
    actualizarDatos(d => {
      const ot = d.ordenes.find(o => o.id === id);
      if (!ot || ot.estado === 'terminada') return d;
      const rutina = d.rutinas.find(r => r.id === ot.rutinaId);
      const r = cerrarOrden(ot, datos, rutina, nuevoId);
      const extra: OrdenTrabajo[] = [];
      let numero = ultimoNumeroOT(d.ordenes);
      if (pendientesEnOtNueva && r.pendientes.length) {
        otNueva = numeroOT(++numero);
        // Las tareas que faltaron mantienen su medición (si la tenían).
        const meds = medicionesDe(ot);
        const pendMeds = r.ot.tareasHechas.flatMap((h, i) => (h ? [] : [meds[i] ?? null]));
        extra.push({
          id: nuevoId(), numero: otNueva, tipo: 'correctiva', equipoId: ot.equipoId, rutinaId: null, mediciones: pendMeds, valores: [], tecnicos: [], liberacion: null,
          fechaProgramada: sumarDias(datos.fechaCierre, 1), tareas: r.pendientes.join('\n'), tareasHechas: [],
          asignadoA: r.ot.asignadoA, estado: 'pendiente', fechaCierre: null,
          observaciones: `Tareas que quedaron pendientes de la ${ot.numero}.`, horas: null, repuestosUsados: '',
          // Los repuestos que no se llegaron a usar pasan a la OT nueva.
          repuestos: datos.repuestos.filter(x => !x.usado).map(x => ({ ...x, id: nuevoId(), usado: null })),
          correctivo: { prioridad: ot.correctivo?.prioridad ?? 'normal', falla: `Pendiente de ${ot.numero}${ot.correctivo?.falla ? `: ${ot.correctivo.falla}` : ''}`, causa: '', solucion: '', horasParada: null },
        });
      }
      if (correctivaPorValores && r.fueraDeRango.length) {
        otValores = numeroOT(++numero);
        const detalle = r.fueraDeRango.map(f => `${f.texto}: ${numeroCorto(f.valor)} ${f.medicion.unidad} (${textoRango(f.medicion)})`.replace(/\s+\(/, ' ('));
        extra.push({
          id: nuevoId(), numero: otValores, tipo: 'correctiva', equipoId: ot.equipoId, rutinaId: null,
          fechaProgramada: sumarDias(datos.fechaCierre, 1), tareasHechas: [], valores: [], tecnicos: [], liberacion: null,
          // Una tarea para revisar la causa y otra para volver a medir cada valor fuera de rango.
          tareas: [...detalle.map(x => `Buscar la causa — ${x}`), ...r.fueraDeRango.map(f => `Después de corregir: ${f.texto}`)].join('\n'),
          mediciones: [...r.fueraDeRango.map(() => null), ...r.fueraDeRango.map(f => f.medicion)],
          asignadoA: r.ot.asignadoA, estado: 'pendiente', fechaCierre: null, observaciones: `Valores fuera de rango en la ${ot.numero}.`,
          horas: null, repuestosUsados: '', repuestos: [],
          correctivo: { prioridad: 'normal', falla: `Valores fuera de rango en la ${ot.numero}: ${detalle.join('; ')}`, causa: '', solucion: '', horasParada: null },
        });
      }
      return {
        ...d,
        ordenes: [...d.ordenes.map(o => (o.id === id ? r.ot : o)), ...extra],
        intervenciones: [...d.intervenciones, r.intervencion],
        consumos: [...d.consumos, ...r.consumos],
        rutinas: r.rutina ? d.rutinas.map(x => (x.id === r.rutina!.id ? r.rutina! : x)) : d.rutinas,
      };
    });
    return { pendientes: otNueva, valores: otValores };
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
