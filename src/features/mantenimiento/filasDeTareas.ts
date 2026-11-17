import { leerNumero } from './preventivo';
import type { TareaDef } from './tipos';

// Ayudas para editar listas de tareas (planillas y rutinas; del diseño del socio). La pantalla está en TareasEditor.tsx.
// Mientras se edita, los números se guardan como texto (para poder escribir "4," sin que se borre).

export interface FilaTarea {
  /** Solo para la pantalla. */
  id: string;
  texto: string;
  /** true = hay que anotar un valor (medición); false = solo se tilda. */
  conValor: boolean;
  unidad: string;
  minimo: string;
  maximo: string;
}

let ultimo = 0;
export function filaNueva(texto = ''): FilaTarea {
  ultimo += 1;
  return { id: `fila-${ultimo}`, texto, conValor: false, unidad: '', minimo: '', maximo: '' };
}

const aTexto = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));

export function filasDeTareas(tareas: TareaDef[]): FilaTarea[] {
  return tareas.map(t => ({
    ...filaNueva(t.texto), conValor: !!t.medicion,
    unidad: t.medicion?.unidad ?? '', minimo: aTexto(t.medicion?.minimo ?? null), maximo: aTexto(t.medicion?.maximo ?? null),
  }));
}

/** Pasa las filas a tareas, sacando las vacías. Devuelve un mensaje si algo está mal (un mínimo que no es número, mínimo mayor que máximo...). */
export function tareasDeFilas(filas: FilaTarea[]): { tareas: TareaDef[] } | { error: string } {
  const tareas: TareaDef[] = [];
  for (const [i, f] of filas.entries()) {
    const texto = f.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    if (!f.conValor) { tareas.push({ texto, medicion: null }); continue; }
    const minimo = leerNumero(f.minimo);
    const maximo = leerNumero(f.maximo);
    if (Number.isNaN(minimo) || Number.isNaN(maximo)) return { error: `Tarea ${i + 1}: el mínimo y el máximo tienen que ser números.` };
    if (minimo != null && maximo != null && minimo > maximo) return { error: `Tarea ${i + 1}: el mínimo es mayor que el máximo.` };
    tareas.push({ texto, medicion: { unidad: f.unidad.trim(), minimo, maximo } });
  }
  return { tareas };
}
