import 'server-only';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { comoUsuario } from './db';
import { usuarioActual, usuarioDeLaCabecera } from './sesion';

// Los errores quedan anotados en public.error_logs (Configuración → Errores), además del registro del servidor (docker logs gestion-web).
// Llegan de tres lados: los de las pantallas (los manda el navegador: ~/componentes/errores), los que atrapan las acciones (mensajeDe) y los
// que nadie atrapó en el servidor (instrumentation.ts). La base deja anotar solo a nombre de quien tiene la sesión: sin sesión, solo el registro.

/** Por persona cada 10 minutos: un error que se repite en bucle no llena la tabla. */
const TOPE = 30;
const cuentas = new Map<string, { desde: number; cantidad: number }>();

// (la cuenta vive en la memoria del proceso, como la de ~/lib/entrada)
function dentroDelTope(usuario: string): boolean {
  const ahora = Date.now();
  const cuenta = cuentas.get(usuario);
  if (!cuenta || ahora - cuenta.desde >= 10 * 60_000) {
    if (cuentas.size > 10_000) cuentas.clear();
    cuentas.set(usuario, { desde: ahora, cantidad: 1 });
    return true;
  }
  cuenta.cantidad += 1;
  return cuenta.cantidad <= TOPE;
}

export type ErrorAAnotar = { mensaje: string; detalle?: string | null; url?: string | null; navegador?: string | null };

export async function anotarError(usuario: string, e: ErrorAAnotar) {
  if (!dentroDelTope(usuario)) return;
  const url = e.url?.slice(0, 2000) || null;
  let pantalla: string | null = null;
  try { pantalla = url ? new URL(url, 'http://local').pathname : null; } catch { /* sin pantalla */ }
  try {
    await comoUsuario(usuario, c => c.query(
      `insert into public.error_logs (usuario_id, usuario_email, mensaje, stack, pantalla, url, user_agent)
       values ($1, (select email from public.usuarios_perfil where id = $1), $2, $3, $4, $5, $6)`,
      [usuario, e.mensaje.slice(0, 2000) || 'Error desconocido', e.detalle?.slice(0, 4000) || null, pantalla, url, e.navegador?.slice(0, 500) || null],
    ));
  } catch (falla) {
    // si no se puede anotar, queda en el registro y no se arma otro error por eso
    console.error('[errores] no se pudo anotar un error', falla);
  }
}

const detalleDe = (e: unknown) => (e instanceof Error ? (e.stack ?? e.message) : typeof e === 'object' && e ? JSON.stringify(e) : String(e));

/**
 * El texto para la persona cuando falla una acción. Los avisos de la base (raise exception) ya están escritos para ella; lo demás es un error
 * de verdad: la persona ve el texto general, sin detalles internos, y el detalle queda anotado.
 */
export function mensajeDe(e: unknown, porDefecto: string): string {
  const pg = e as { code?: string; message?: string } | null;
  if (pg?.code === 'P0001' && pg.message) return pg.message;
  console.error(`[acción] ${porDefecto}`, e);
  const mensaje = `${pg?.code ? `[${pg.code}] ` : ''}${porDefecto}: ${pg?.message ?? String(e)}`;
  try {
    // después de responder, así la persona no espera por esto
    after(async () => {
      const usuario = await usuarioActual();
      if (!usuario) return;
      const h = await headers();
      await anotarError(usuario, { mensaje, detalle: detalleDe(e), url: h.get('referer'), navegador: h.get('user-agent') });
    });
  } catch { /* fuera de un pedido no hay a nombre de quién anotarlo */ }
  return porDefecto;
}

/** Un error que nadie atrapó en el servidor (al armar una pantalla, en una acción o en una dirección como /miniatura). */
export async function anotarErrorDelPedido(e: unknown, pedido: { path: string; headers: NodeJS.Dict<string | string[]> }) {
  const cabecera = (nombre: string) => { const v = pedido.headers[nombre]; return Array.isArray(v) ? v[0] : v; };
  const usuario = await usuarioDeLaCabecera(cabecera('cookie')).catch(() => null);
  if (!usuario) return;
  const mensaje = e instanceof Error ? e.message : String(e);
  await anotarError(usuario, { mensaje: `[servidor] ${mensaje}`, detalle: detalleDe(e), url: pedido.path, navegador: cabecera('user-agent') });
}
