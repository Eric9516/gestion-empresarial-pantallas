// Las listas que crecen sin freno (retiros, movimientos, auditoría, errores…) se piden de a páginas, las más nuevas primero, y la página siguiente se pide "desde el
// último elemento" (su fecha y su id), no con "saltear N": una página 1.000 cuesta lo mismo que la primera. Así la aplicación aguanta millones de filas.

// Dónde quedó la lista: la fecha y el id del último elemento que se trajo.
export interface Cursor { created_at: string; id: string }
