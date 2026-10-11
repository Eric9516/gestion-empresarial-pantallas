// Texto de un error para mostrarle a la persona. Los errores de la base de datos (Supabase) no son
// instancias de `Error`, son objetos con `message`: por eso `e instanceof Error ? e.message : ''`
// dejaba el aviso vacío ("Error al guardar:" sin decir por qué).
export function mensajeDeError(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
    const d = (e as { details?: unknown }).details;
    if (typeof d === 'string' && d) return d;
  }
  return '';
}
