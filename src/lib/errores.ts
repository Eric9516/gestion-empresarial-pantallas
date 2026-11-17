// Texto de un error para mostrarle a la persona. Los errores de la base de datos (Supabase) no son
// instancias de `Error`, son objetos con `message`: por eso `e instanceof Error ? e.message : ''`
// dejaba el aviso vacío ("Error al guardar:" sin decir por qué).
export function mensajeDeError(e: unknown): string {
  if (esDeUnaVersionVieja(e)) {
    // (la app de Next escucha este aviso y recarga la pantalla, o pide recargarla si hay una ventana abierta: AvisoDeVersionNueva)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_VERSION_NUEVA));
    return 'Se actualizó la app. Recargá la página y probá de nuevo.';
  }
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
    const d = (e as { details?: unknown }).details;
    if (typeof d === 'string' && d) return d;
  }
  return '';
}

/** Lo que avisa (en la ventana del navegador) que la pantalla quedó de una versión anterior de la app. */
export const EVENTO_VERSION_NUEVA = 'gestion:version-nueva';

/**
 * Una acción del servidor que ya no existe: se publicó una versión nueva de la app mientras la pantalla estaba abierta (cada versión nombra
 * distinto sus acciones). Recargando, anda.
 */
export function esDeUnaVersionVieja(e: unknown): boolean {
  const m = typeof e === 'string' ? e : e && typeof e === 'object' ? (e as { message?: unknown }).message : '';
  return typeof m === 'string' && /Server Action .* was not found on the server|Failed to find Server Action/i.test(m);
}
