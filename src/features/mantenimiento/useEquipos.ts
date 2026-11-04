import { useMemo } from 'react';
import { normalizar } from './buscador';
import { actualizarDatos, mutacionDemo, nuevoId, useDatosDemo } from './almacenDemo';
import type { ConsumoStock, DatosMantenimiento, Equipo, Intervencion, Manual, RepuestoCritico } from './tipos';

// Datos de equipos, su historial, repuestos críticos y manuales.
// HOY: devuelven los datos de ejemplo (almacenDemo.ts). PARA ERIC: reemplazar el interior de
// cada función por consultas a la base (con react-query, como useReparaciones.ts), manteniendo
// la forma de lo que devuelven: { data, isLoading, isError } y { mutateAsync, isPending }.

const sinCarga = { isLoading: false, isError: false } as const;

export function useEquiposQuery() {
  const d = useDatosDemo();
  return { data: d.equipos, ...sinCarga };
}

export function useIntervencionesQuery() {
  const d = useDatosDemo();
  return { data: d.intervenciones, ...sinCarga };
}

export function useRepuestosCriticosQuery() {
  const d = useDatosDemo();
  return { data: d.repuestosCriticos, ...sinCarga };
}

export function useManualesQuery() {
  const d = useDatosDemo();
  return { data: d.manuales, ...sinCarga };
}

/** Todo lo de un equipo junto (para su ficha). */
export function useFichaEquipo(equipoId: string | null) {
  const d = useDatosDemo();
  return useMemo(() => {
    if (!equipoId) return null;
    const equipo = d.equipos.find(e => e.id === equipoId);
    if (!equipo) return null;
    return {
      equipo,
      intervenciones: d.intervenciones.filter(i => i.equipoId === equipoId).sort((a, b) => b.fecha.localeCompare(a.fecha)),
      padre: equipo.padreId ? d.equipos.find(e => e.id === equipo.padreId) ?? null : null,
      subEquipos: d.equipos.filter(e => e.padreId === equipoId).sort((a, b) => a.codigo.localeCompare(b.codigo)),
      /** Historial de los sub-equipos (para verlo junto con el del principal). */
      intervencionesSub: d.intervenciones.filter(i => d.equipos.some(e => e.padreId === equipoId && e.id === i.equipoId)).sort((a, b) => b.fecha.localeCompare(a.fecha)),
      repuestos: d.repuestosCriticos.filter(r => r.equipoId === equipoId),
      manuales: d.manuales.filter(m => m.equipoId === equipoId),
      rutinas: d.rutinas.filter(r => r.equipoId === equipoId),
      ordenes: d.ordenes.filter(o => o.equipoId === equipoId),
    };
  }, [d, equipoId]);
}

export type EquipoInput = Omit<Equipo, 'id'> & { id?: string };

/** Devuelve el id del equipo guardado. */
export function useGuardarEquipo() {
  return mutacionDemo((e: EquipoInput): string => {
    const id = e.id ?? nuevoId();
    actualizarDatos(d => {
      const codigo = e.codigo.trim();
      const repetido = d.equipos.some(x => x.id !== e.id && x.codigo.trim().toLowerCase() === codigo.toLowerCase());
      if (repetido) throw new Error(`Ya existe un equipo con el código ${codigo}.`);
      if (e.padreId) {
        const padre = d.equipos.find(x => x.id === e.padreId);
        if (!padre) throw new Error('El equipo principal elegido no existe.');
        if (padre.padreId) throw new Error(`${padre.codigo} ya es un sub-equipo: elegí un equipo principal.`);
        if (e.id && padre.id === e.id) throw new Error('Un equipo no puede ser sub-equipo de sí mismo.');
        if (e.id && d.equipos.some(x => x.padreId === e.id)) throw new Error('Este equipo tiene sub-equipos: no puede pasar a ser sub-equipo de otro.');
      }
      if (e.id) return { ...d, equipos: d.equipos.map(x => (x.id === e.id ? { ...x, ...e, id: x.id } : x)) };
      return { ...d, equipos: [...d.equipos, { ...e, id }] };
    });
    return id;
  });
}

/** Borra el equipo (y sus sub-equipos) con todo lo suyo (historial, repuestos, manuales, rutinas y OT). */
export function useEliminarEquipo() {
  return mutacionDemo((id: string) => {
    actualizarDatos(d => {
      const ids = new Set([id, ...d.equipos.filter(e => e.padreId === id).map(e => e.id)]);
      return {
        ...d,
        equipos: d.equipos.filter(e => !ids.has(e.id)),
        intervenciones: d.intervenciones.filter(x => !ids.has(x.equipoId)),
        repuestosCriticos: d.repuestosCriticos.filter(x => !ids.has(x.equipoId)),
        manuales: d.manuales.filter(x => !ids.has(x.equipoId)),
        rutinas: d.rutinas.filter(x => !ids.has(x.equipoId)),
        ordenes: d.ordenes.filter(x => !ids.has(x.equipoId)),
      };
    });
  });
}

export interface DuplicarInput {
  id: string;
  codigo: string;
  nombre: string;
  numeroSerie: string;
  /** Copiar también las rutinas preventivas (con la misma próxima fecha). */
  conRutinas: boolean;
}

/**
 * Copia un equipo con sus sub-equipos y sus repuestos críticos (y, si se pide, sus rutinas), para cargar
 * rápido equipos iguales (ej.: 4 pasteurizadores). Los códigos de los sub-equipos cambian el principio:
 * PA-01-B1 pasa a PA-02-B1. El historial, los manuales y las OT no se copian. Devuelve el id del nuevo.
 */
export function useDuplicarEquipo() {
  return mutacionDemo(({ id, codigo, nombre, numeroSerie, conRutinas }: DuplicarInput): string => {
    const nuevoPrincipal = nuevoId();
    actualizarDatos(d => {
      const original = d.equipos.find(e => e.id === id);
      if (!original) throw new Error('No se encontró el equipo.');
      const cod = codigo.trim();
      if (!cod || !nombre.trim()) throw new Error('Completá el código y el nombre.');
      const hijos = d.equipos.filter(e => e.padreId === id);
      const codigoHijo = (c: string) => (c.startsWith(original.codigo) ? cod + c.slice(original.codigo.length) : `${cod}-${c}`);
      const nuevos = [
        { ...original, id: nuevoPrincipal, codigo: cod, nombre: nombre.trim(), numeroSerie: numeroSerie.trim() },
        ...hijos.map(h => ({ ...h, id: nuevoId(), codigo: codigoHijo(h.codigo), numeroSerie: '', padreId: nuevoPrincipal })),
      ];
      const existentes = new Set(d.equipos.map(e => e.codigo.trim().toLowerCase()));
      const choca = nuevos.find(n => existentes.has(n.codigo.toLowerCase()));
      if (choca) throw new Error(`Ya existe un equipo con el código ${choca.codigo}.`);
      // De qué equipo viejo sale cada nuevo, para copiar sus repuestos y rutinas.
      const mapa = new Map([[id, nuevoPrincipal], ...hijos.map((h, i) => [h.id, nuevos[i + 1].id] as [string, string])]);
      return {
        ...d,
        equipos: [...d.equipos, ...nuevos],
        repuestosCriticos: [...d.repuestosCriticos, ...d.repuestosCriticos.filter(r => mapa.has(r.equipoId)).map(r => ({ ...r, id: nuevoId(), equipoId: mapa.get(r.equipoId)! }))],
        rutinas: conRutinas ? [...d.rutinas, ...d.rutinas.filter(r => mapa.has(r.equipoId)).map(r => ({ ...r, id: nuevoId(), equipoId: mapa.get(r.equipoId)! }))] : d.rutinas,
      };
    });
    return nuevoPrincipal;
  });
}

/**
 * Guardar una entrada del historial. Con `descontarStock` (solo al crearla), los repuestos usados se descuentan
 * del stock del Depósito (en modo de ejemplo: se anotan como consumos).
 */
export function useRegistrarIntervencion() {
  return mutacionDemo((i: Omit<Intervencion, 'id'> & { id?: string; descontarStock?: boolean }) => {
    const { descontarStock, ...datos } = i;
    actualizarDatos(d => {
      if (datos.id) return { ...d, intervenciones: d.intervenciones.map(x => (x.id === datos.id ? { ...x, ...datos, id: x.id } : x)) };
      const nueva: Intervencion = { ...datos, id: nuevoId() };
      const consumos: ConsumoStock[] = descontarStock
        ? nueva.repuestos.filter(r => r.codigo.trim() && r.cantidad > 0).map(r => ({
          id: nuevoId(), fecha: nueva.fecha, codigo: r.codigo, descripcion: r.descripcion, cantidad: r.cantidad,
          equipoId: nueva.equipoId, otId: nueva.otId, intervencionId: nueva.id,
        }))
        : [];
      return { ...d, intervenciones: [...d.intervenciones, nueva], consumos: [...d.consumos, ...consumos] };
    });
  });
}

export function useEliminarIntervencion() {
  return mutacionDemo((id: string) => {
    actualizarDatos(d => ({ ...d, intervenciones: d.intervenciones.filter(x => x.id !== id) }));
  });
}

export function useGuardarRepuestoCritico() {
  return mutacionDemo((r: Omit<RepuestoCritico, 'id'> & { id?: string }) => {
    actualizarDatos(d => {
      const mismo = d.repuestosCriticos.find(x => x.id !== r.id && x.equipoId === r.equipoId && x.codigo.toLowerCase() === r.codigo.toLowerCase());
      if (mismo) throw new Error('Ese repuesto ya está en la lista de este equipo.');
      return r.id
        ? { ...d, repuestosCriticos: d.repuestosCriticos.map(x => (x.id === r.id ? { ...x, ...r, id: x.id } : x)) }
        : { ...d, repuestosCriticos: [...d.repuestosCriticos, { ...r, id: nuevoId() }] };
    });
  });
}

export function useQuitarRepuestoCritico() {
  return mutacionDemo((id: string) => {
    actualizarDatos(d => ({ ...d, repuestosCriticos: d.repuestosCriticos.filter(x => x.id !== id) }));
  });
}

export function useAgregarManual() {
  return mutacionDemo(({ equipoId, archivo, hoy }: { equipoId: string; archivo: File; hoy: string }) => {
    // PARA ERIC: acá se sube el archivo al almacenamiento (como las fotos de repuestos) y se guarda su dirección.
    const manual: Manual = { id: nuevoId(), equipoId, nombre: archivo.name, url: URL.createObjectURL(archivo), tamanioBytes: archivo.size, subidoEl: hoy };
    actualizarDatos(d => ({ ...d, manuales: [...d.manuales, manual] }));
  });
}

export function useQuitarManual() {
  return mutacionDemo((id: string) => {
    actualizarDatos(d => ({ ...d, manuales: d.manuales.filter(x => x.id !== id) }));
  });
}

/**
 * Componentes del equipo para elegir al anotar un repuesto: sus sub-equipos y las partes ya usadas antes
 * en sus OT, rutinas e historial (ej.: "Motor lado acople").
 */
export function useComponentesDeEquipo(equipoId: string | null): string[] {
  const d = useDatosDemo();
  return useMemo(() => {
    if (!equipoId) return [];
    const lineas = [
      ...d.intervenciones.filter(x => x.equipoId === equipoId).flatMap(x => x.repuestos),
      ...d.rutinas.filter(x => x.equipoId === equipoId).flatMap(x => x.repuestos),
      ...d.ordenes.filter(x => x.equipoId === equipoId).flatMap(x => x.repuestos),
    ];
    const subs = d.equipos.filter(e => e.padreId === equipoId).map(e => e.nombre);
    const vistos = new Map<string, string>();
    for (const n of [...subs, ...lineas.map(l => l.componente)]) {
      const t = n.trim();
      if (t && !vistos.has(t.toLowerCase())) vistos.set(t.toLowerCase(), t);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [d, equipoId]);
}

/**
 * Nombres para sugerir en "Realizado por", "Responsable" y "Asignada a" (los ya usados).
 * PARA ERIC: cuando haya base, conviene sugerir los usuarios con rol de Mantenimiento.
 */
export function usePersonasSugeridas(): string[] {
  const d = useDatosDemo();
  return useMemo(() => [...new Set([
    ...d.intervenciones.map(i => i.realizadoPor), ...d.rutinas.map(r => r.responsable), ...d.ordenes.map(o => o.asignadoA),
  ].map(s => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [d]);
}

// ---------- Sectores y sub-sectores ----------
// Un sector es una etiqueta de los equipos; un sector puede tener sub-sectores (ej.: Servicios → Aire comprimido,
// Frío, Vapor). Dos niveles fijos, no carpetas sin fin. La lista junta los creados a mano y los que usan los equipos.
// PARA ERIC: con la base conviene una tabla equipo_sectores (id, nombre, padre_id null = sector) y que el equipo
// apunte al sector o sub-sector; así renombrar es cambiar una sola fila.

export interface SubsectorConCantidad { nombre: string; equipos: number }
export interface SectorConCantidad { nombre: string; equipos: number; subsectores: SubsectorConCantidad[] }

function clave(nombre: string) {
  return normalizar(nombre.trim());
}

export function useSectoresMantenimiento(): SectorConCantidad[] {
  const d = useDatosDemo();
  return useMemo(() => {
    const m = new Map<string, { nombre: string; equipos: number; subs: Map<string, SubsectorConCantidad> }>();
    const sector = (nombre: string) => {
      const k = clave(nombre);
      if (!m.has(k)) m.set(k, { nombre: nombre.trim(), equipos: 0, subs: new Map() });
      return m.get(k)!;
    };
    const sub = (s: ReturnType<typeof sector>, nombre: string) => {
      const k = clave(nombre);
      if (!s.subs.has(k)) s.subs.set(k, { nombre: nombre.trim(), equipos: 0 });
      return s.subs.get(k)!;
    };
    for (const s of d.sectores) if (s.trim()) sector(s);
    for (const x of d.subsectores) if (x.sector.trim() && x.nombre.trim()) sub(sector(x.sector), x.nombre);
    for (const e of d.equipos) {
      if (!e.sector.trim()) continue;
      const s = sector(e.sector);
      s.equipos += 1;
      if (e.subsector.trim()) sub(s, e.subsector).equipos += 1;
    }
    const orden = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');
    return [...m.values()].map(s => ({ nombre: s.nombre, equipos: s.equipos, subsectores: [...s.subs.values()].sort(orden) })).sort(ordenDeSectores(d.ordenSectores));
  }, [d]);
}

/** Compara dos sectores según el orden elegido; los que no están en el orden van al final, por nombre. */
export function ordenDeSectores(ordenSectores: string[]) {
  const pos = new Map(ordenSectores.map((s, i) => [clave(s), i]));
  return (a: { nombre: string }, b: { nombre: string }) =>
    (pos.get(clave(a.nombre)) ?? Infinity) - (pos.get(clave(b.nombre)) ?? Infinity) || a.nombre.localeCompare(b.nombre, 'es');
}

/** Sube o baja un sector un lugar en el orden. `actuales` es la lista como se ve hoy. */
export function useMoverSector() {
  return mutacionDemo(({ actuales, nombre, delta }: { actuales: string[]; nombre: string; delta: -1 | 1 }) => {
    const i = actuales.findIndex(s => clave(s) === clave(nombre));
    const j = i + delta;
    if (i < 0 || j < 0 || j >= actuales.length) return;
    const nuevo = [...actuales];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    actualizarDatos(d => ({ ...d, ordenSectores: nuevo }));
  });
}

function existeSector(d: DatosMantenimiento, n: string) {
  return d.sectores.some(s => clave(s) === clave(n)) || d.equipos.some(e => clave(e.sector) === clave(n));
}

export function useCrearSector() {
  return mutacionDemo((nombre: string) => {
    const n = nombre.trim();
    if (!n) throw new Error('Escribí el nombre del sector.');
    actualizarDatos(d => {
      if (existeSector(d, n)) throw new Error(`Ya existe el sector "${n}".`);
      return { ...d, sectores: [...d.sectores, n] };
    });
  });
}

export function useCrearSubsector() {
  return mutacionDemo(({ sector, nombre }: { sector: string; nombre: string }) => {
    const n = nombre.trim();
    if (!n) throw new Error('Escribí el nombre del sub-sector.');
    actualizarDatos(d => {
      const existe = d.subsectores.some(x => clave(x.sector) === clave(sector) && clave(x.nombre) === clave(n))
        || d.equipos.some(e => clave(e.sector) === clave(sector) && clave(e.subsector) === clave(n));
      if (existe) throw new Error(`Ya existe "${n}" dentro de ${sector}.`);
      return { ...d, subsectores: [...d.subsectores, { sector: sector.trim(), nombre: n }] };
    });
  });
}

/** Cambia el nombre en todos sus equipos. Si el nombre nuevo ya existe, los dos sectores quedan juntos. */
export function useRenombrarSector() {
  return mutacionDemo(({ viejo, nuevo }: { viejo: string; nuevo: string }) => {
    const n = nuevo.trim();
    if (!n) throw new Error('Escribí el nombre nuevo.');
    actualizarDatos(d => {
      // Si ya existe uno con ese nombre, se respeta cómo está escrito ese.
      const destino = [...d.sectores, ...d.equipos.map(e => e.sector)].find(s => clave(s) === clave(n) && clave(s) !== clave(viejo)) ?? n;
      const sectores = [...d.sectores.filter(s => clave(s) !== clave(viejo) && clave(s) !== clave(destino)), destino];
      return {
        ...d,
        sectores,
        ordenSectores: d.ordenSectores.map(s => (clave(s) === clave(viejo) ? destino : s)).filter((s, i, arr) => arr.findIndex(x => clave(x) === clave(s)) === i),
        subsectores: d.subsectores.map(x => (clave(x.sector) === clave(viejo) ? { ...x, sector: destino } : x)),
        equipos: d.equipos.map(e => (clave(e.sector) === clave(viejo) ? { ...e, sector: destino } : e)),
      };
    });
  });
}

/** Igual que con los sectores: cambia el nombre en sus equipos y, si ya existe otro igual en el mismo sector, los junta. */
export function useRenombrarSubsector() {
  return mutacionDemo(({ sector, viejo, nuevo }: { sector: string; viejo: string; nuevo: string }) => {
    const n = nuevo.trim();
    if (!n) throw new Error('Escribí el nombre nuevo.');
    actualizarDatos(d => {
      const enSector = (x: { sector: string }) => clave(x.sector) === clave(sector);
      const destino = [...d.subsectores.filter(enSector).map(x => x.nombre), ...d.equipos.filter(enSector).map(e => e.subsector)]
        .find(s => clave(s) === clave(n) && clave(s) !== clave(viejo)) ?? n;
      return {
        ...d,
        subsectores: [
          ...d.subsectores.filter(x => !(enSector(x) && (clave(x.nombre) === clave(viejo) || clave(x.nombre) === clave(destino)))),
          { sector: sector.trim(), nombre: destino },
        ],
        equipos: d.equipos.map(e => (enSector(e) && clave(e.subsector) === clave(viejo) ? { ...e, subsector: destino } : e)),
      };
    });
  });
}

/** Borra el sector (y sus sub-sectores); sus equipos quedan sin sector (no se borra ningún equipo). */
export function useEliminarSector() {
  return mutacionDemo((nombre: string) => {
    actualizarDatos(d => ({
      ...d,
      sectores: d.sectores.filter(s => clave(s) !== clave(nombre)),
      ordenSectores: d.ordenSectores.filter(s => clave(s) !== clave(nombre)),
      subsectores: d.subsectores.filter(x => clave(x.sector) !== clave(nombre)),
      equipos: d.equipos.map(e => (clave(e.sector) === clave(nombre) ? { ...e, sector: '', subsector: '' } : e)),
    }));
  });
}

/** Borra el sub-sector; sus equipos quedan en el sector, sin sub-sector. */
export function useEliminarSubsector() {
  return mutacionDemo(({ sector, nombre }: { sector: string; nombre: string }) => {
    actualizarDatos(d => ({
      ...d,
      subsectores: d.subsectores.filter(x => !(clave(x.sector) === clave(sector) && clave(x.nombre) === clave(nombre))),
      equipos: d.equipos.map(e => (clave(e.sector) === clave(sector) && clave(e.subsector) === clave(nombre) ? { ...e, subsector: '' } : e)),
    }));
  });
}
