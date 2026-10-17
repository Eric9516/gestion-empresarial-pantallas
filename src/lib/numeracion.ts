// Búsqueda "mientras escribís" y sugerencia del próximo número de repuesto.

// Sin mayúsculas ni tildes: "Bulonería" se encuentra escribiendo "buloneria" o "BULON".
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Todas las palabras escritas tienen que aparecer en alguno de los campos de la opción.
export function filtrarOpciones<T>(opciones: T[], texto: string, campos: (o: T) => string[]): T[] {
  const palabras = normalizarTexto(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return opciones;
  return opciones.filter(o => {
    const cs = campos(o).map(normalizarTexto);
    return palabras.every(p => cs.some(c => c.includes(p)));
  });
}

export const LARGO_NUMERO = 5;
const MAXIMO = 10 ** LARGO_NUMERO - 1; // 99999

export interface RepuestoNumerado {
  id: string;
  codigo: string;
  numero: string;
  descripcion: string | null;
}

export interface AnalisisDeNumeros {
  /** El que sigue al más alto usado en la subfamilia, con ceros a la izquierda (null si ya no quedan números). */
  siguiente: string | null;
  /** El más alto que ya está usado (sirve para explicar de dónde sale la sugerencia). */
  ultimo: string | null;
  /** Repuestos que ya existen con el número cargado pero sin descripción: conviene completarlos en vez de crear otro. */
  enBlanco: RepuestoNumerado[];
  /** Números libres en el medio (entre el 1 y el más alto usado): los primeros, con ceros a la izquierda. */
  huecos: string[];
  /** Cuántos números libres hay en el medio en total (puede ser más que los que trae `huecos`). */
  totalHuecos: number;
}

// Con tantos huecos se muestran solo los primeros: el resto se ve al ir usándolos.
export const HUECOS_VISIBLES = 8;

const aEntero = (numero: string): number | null => (/^\d+$/.test(numero.trim()) ? parseInt(numero, 10) : null);

export function numeroConCeros(n: number): string {
  return String(n).padStart(LARGO_NUMERO, '0');
}

// `repuestos` son TODOS los de la subfamilia, también los desactivados: su número sigue ocupado en la base.
export function analizarNumeros(repuestos: RepuestoNumerado[]): AnalisisDeNumeros {
  let max = 0;
  const usados = new Set<number>();
  for (const r of repuestos) { const n = aEntero(r.numero); if (n !== null) { usados.add(n); if (n > max) max = n; } }
  // Huecos: números que nadie usa entre el 1 y el más alto. Una sola pasada sobre lo que ya está cargado (como mucho 99.998 vueltas, sin consultas nuevas).
  const huecos: string[] = [];
  let totalHuecos = 0;
  for (let n = 1; n < max && n <= MAXIMO; n++) {
    if (usados.has(n)) continue;
    totalHuecos++;
    if (huecos.length < HUECOS_VISIBLES) huecos.push(numeroConCeros(n));
  }
  const enBlanco = repuestos
    .filter(r => !(r.descripcion ?? '').trim())
    .sort((a, b) => (aEntero(a.numero) ?? 0) - (aEntero(b.numero) ?? 0));
  return {
    siguiente: max >= MAXIMO ? null : numeroConCeros(max + 1),
    ultimo: max > 0 ? numeroConCeros(max) : null,
    enBlanco,
    huecos,
    totalHuecos,
  };
}

// ¿Ese número ya lo usa algún repuesto de la subfamilia? ("23", "023" y "00023" son el mismo)
export function repuestoConNumero(repuestos: RepuestoNumerado[], numero: string): RepuestoNumerado | null {
  const n = aEntero(numero);
  if (n === null) return null;
  return repuestos.find(r => aEntero(r.numero) === n) ?? null;
}
