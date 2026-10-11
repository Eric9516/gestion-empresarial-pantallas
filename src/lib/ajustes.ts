// Cuentas y controles del ajuste de inventario. La base de datos vuelve a controlar todo esto al confirmar
// (es la que manda); acá sirve para avisar mientras se arma la lista, antes de apretar el botón.

export type TipoAjuste = 'suma' | 'resta';

export interface LineaAjuste {
  tipo: TipoAjuste;
  cantidad: number | null; // null = todavía no escribió una cantidad válida
  stock: number | null; // stock actual del repuesto (null = sin cargar, cuenta como 0)
}

// Stock que va a quedar después de aplicar la línea.
export function stockResultante(stock: number | null, tipo: TipoAjuste, cantidad: number): number {
  const actual = stock ?? 0;
  const r = tipo === 'suma' ? actual + cantidad : actual - cantidad;
  // 0.1 + 0.2 no da 0.3 en el navegador: se redondea a lo que se puede cargar (3 decimales).
  return Math.round(r * 1000) / 1000;
}

// Lee lo que escribió la persona ("12", "12,5", "12.5"). Devuelve null si no es un número mayor que cero.
export function leerCantidad(texto: string): number | null {
  const n = Number(texto.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Primer problema de la lista, o null si se puede confirmar.
export function problemaDelAjuste(lineas: LineaAjuste[], motivo: string): string | null {
  if (!lineas.length) return 'Agregá al menos un artículo.';
  if (!motivo.trim()) return 'Indicá el motivo del ajuste.';
  if (motivo.trim().length > 500) return 'El motivo es demasiado largo (máximo 500 caracteres).';
  if (lineas.some(l => l.cantidad === null)) return 'Hay artículos sin una cantidad válida (mayor que cero).';
  if (lineas.some(l => l.tipo === 'resta' && stockResultante(l.stock, 'resta', l.cantidad as number) < 0)) {
    return 'Hay artículos a los que se les resta más de lo que hay en stock.';
  }
  return null;
}

export function resumenDelAjuste(lineas: Pick<LineaAjuste, 'tipo' | 'cantidad'>[]) {
  let sumas = 0, restas = 0, unidadesSumadas = 0, unidadesRestadas = 0;
  for (const l of lineas) {
    const c = l.cantidad ?? 0;
    if (l.tipo === 'suma') { sumas++; unidadesSumadas += c; } else { restas++; unidadesRestadas += c; }
  }
  return { sumas, restas, unidadesSumadas: Math.round(unidadesSumadas * 1000) / 1000, unidadesRestadas: Math.round(unidadesRestadas * 1000) / 1000 };
}

// "5", "2,5": sin ceros de más, con coma como en Argentina.
export function formatoCantidad(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(n);
}
