// Las listas que crecen sin freno (retiros, movimientos, auditoría, errores…) se piden de a páginas, las más nuevas primero, y la página siguiente se pide "desde el
// último elemento" (su fecha y su id), no con "saltear N": una página 1.000 cuesta lo mismo que la primera. Así la aplicación aguanta millones de filas.

export const POR_PAGINA = 50;

// Dónde quedó la lista: la fecha y el id del último elemento que se trajo.
export interface Cursor { created_at: string; id: string }

// Si la página vino completa, puede haber más: el cursor es su último elemento. Si vino incompleta, no hay más.
export function cursorSiguiente<T extends { created_at: string; id: string }>(pagina: T[], porPagina = POR_PAGINA): Cursor | undefined {
  if (pagina.length < porPagina) return undefined;
  const ultimo = pagina[pagina.length - 1];
  return { created_at: ultimo.created_at, id: ultimo.id };
}

// Condición para una consulta directa a una tabla (PostgREST): lo que viene "después" del cursor en el orden (fecha desc, id desc).
export function despuesDelCursor(cursor: Cursor | null | undefined): string | null {
  if (!cursor) return null;
  return `created_at.lt."${cursor.created_at}",and(created_at.eq."${cursor.created_at}",id.lt."${cursor.id}")`;
}
