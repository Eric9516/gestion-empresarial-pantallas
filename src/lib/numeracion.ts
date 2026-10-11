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
}

const aEntero = (numero: string): number | null => (/^\d+$/.test(numero.trim()) ? parseInt(numero, 10) : null);

export function numeroConCeros(n: number): string {
  return String(n).padStart(LARGO_NUMERO, '0');
}

// `repuestos` son TODOS los de la subfamilia, también los desactivados: su número sigue ocupado en la base.
export function analizarNumeros(repuestos: RepuestoNumerado[]): AnalisisDeNumeros {
  let max = 0;
  for (const r of repuestos) { const n = aEntero(r.numero); if (n !== null && n > max) max = n; }
  const enBlanco = repuestos
    .filter(r => !(r.descripcion ?? '').trim())
    .sort((a, b) => (aEntero(a.numero) ?? 0) - (aEntero(b.numero) ?? 0));
  return {
    siguiente: max >= MAXIMO ? null : numeroConCeros(max + 1),
    ultimo: max > 0 ? numeroConCeros(max) : null,
    enBlanco,
  };
}

// ¿Ese número ya lo usa algún repuesto de la subfamilia? ("23", "023" y "00023" son el mismo)
export function repuestoConNumero(repuestos: RepuestoNumerado[], numero: string): RepuestoNumerado | null {
  const n = aEntero(numero);
  if (n === null) return null;
  return repuestos.find(r => aEntero(r.numero) === n) ?? null;
}
