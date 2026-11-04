import { nuevoId } from './almacenDemo';
import { listaDeTareas, medicionesDe, textoRango } from './preventivo';
import type { Medicion, TareaDef } from './tipos';

// Ayudas para editar listas de tareas (planillas y rutinas). La pantalla está en TareasEditor.tsx.
// Mientras se edita, los números se guardan como texto (para poder escribir "4," sin que se borre).

export interface FilaTarea {
  id: string;
  texto: string;
  /** true = hay que anotar un valor (medición); false = solo se tilda. */
  conValor: boolean;
  unidad: string;
  minimo: string;
  maximo: string;
}

export function filaNueva(texto = ''): FilaTarea {
  return { id: nuevoId(), texto, conValor: false, unidad: '', minimo: '', maximo: '' };
}

const aTexto = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));

export function filasDeTareas(tareas: TareaDef[]): FilaTarea[] {
  return tareas.map(t => ({
    id: t.id, texto: t.texto, conValor: !!t.medicion,
    unidad: t.medicion?.unidad ?? '', minimo: aTexto(t.medicion?.minimo ?? null), maximo: aTexto(t.medicion?.maximo ?? null),
  }));
}

/** Las tareas de una rutina (texto con una por renglón + mediciones) como filas para editar. */
export function filasDeRutina(r: { tarea: string; mediciones: (Medicion | null)[] }): FilaTarea[] {
  const meds = medicionesDe(r);
  return filasDeTareas(listaDeTareas(r.tarea).map((texto, i) => ({ id: nuevoId(), texto, medicion: meds[i] })));
}

function aNumero(t: string): number | null | 'error' {
  const s = t.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : 'error';
}

/**
 * Pasa las filas a tareas, sacando las vacías. Devuelve un mensaje si algo está mal
 * (un mínimo que no es número, mínimo mayor que máximo...).
 */
export function tareasDeFilas(filas: FilaTarea[]): { tareas: TareaDef[] } | { error: string } {
  const tareas: TareaDef[] = [];
  for (const [i, f] of filas.entries()) {
    const texto = f.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    if (!f.conValor) { tareas.push({ id: f.id, texto, medicion: null }); continue; }
    const minimo = aNumero(f.minimo);
    const maximo = aNumero(f.maximo);
    if (minimo === 'error' || maximo === 'error') return { error: `Tarea ${i + 1}: el mínimo y el máximo tienen que ser números.` };
    if (minimo != null && maximo != null && minimo > maximo) return { error: `Tarea ${i + 1}: el mínimo es mayor que el máximo.` };
    tareas.push({ id: f.id, texto, medicion: { unidad: f.unidad.trim(), minimo, maximo } });
  }
  return { tareas };
}

/** Una tarea en una línea: "Medir vibración (normal 0 a 4,5 mm/s)". */
export function textoTareaDef(t: { texto: string; medicion: Medicion | null }): string {
  return t.medicion ? `${t.texto} (${textoRango(t.medicion) || 'anotar valor'})` : t.texto;
}
