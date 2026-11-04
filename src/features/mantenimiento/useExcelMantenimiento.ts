import { actualizarDatos, mutacionDemo, nuevoId, obtenerDatos } from './almacenDemo';
import { analizarLibro, leerArchivoExcel, type AnalisisImportacion } from './excelMantenimiento';
import type { DatosMantenimiento } from './tipos';

// Importación de Excel: primero se analiza (sin guardar) y, si el encargado confirma, se guarda.
// PARA ERIC: `analizarArchivoMantenimiento` necesita los datos actuales (para saber qué es nuevo y qué
// se actualiza); `useAplicarImportacion` tendría que guardar todo junto (una sola operación en la base).

export async function analizarArchivoMantenimiento(file: File, actual: DatosMantenimiento = obtenerDatos()): Promise<AnalisisImportacion> {
  const libro = await leerArchivoExcel(file);
  return analizarLibro(libro, actual, nuevoId);
}

function reemplazar<T extends { id: string }>(lista: T[], nuevos: T[], actualizados: T[]): T[] {
  const porId = new Map(actualizados.map(x => [x.id, x]));
  return [...lista.map(x => porId.get(x.id) ?? x), ...nuevos];
}

export function useAplicarImportacion() {
  return mutacionDemo((a: AnalisisImportacion) => {
    actualizarDatos(d => ({
      ...d,
      sectores: [...d.sectores, ...a.sectoresNuevos.filter(x => !x.subsector).map(x => x.sector)],
      ordenSectores: a.ordenSectores ?? d.ordenSectores,
      subsectores: [...d.subsectores, ...a.sectoresNuevos.filter(x => x.subsector).map(x => ({ sector: x.sector, nombre: x.subsector }))],
      equipos: reemplazar(d.equipos, a.equiposNuevos, a.equiposActualizados),
      intervenciones: [...d.intervenciones, ...a.intervenciones],
      repuestosCriticos: reemplazar(d.repuestosCriticos, a.repuestosNuevos, a.repuestosActualizados),
      planillas: reemplazar(d.planillas, a.planillasNuevas, a.planillasActualizadas),
      rutinas: reemplazar(d.rutinas, a.rutinasNuevas, a.rutinasActualizadas),
    }));
  });
}
