import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { base, COOKIE_DEL_DEPOSITO } from './db';

// La sesión: un número al azar en una cookie que el navegador no deja leer a la página (httpOnly). La base guarda solo su huella.
const COOKIE = 'sesion';
const huella = (token: string) => createHash('sha256').update(token).digest();

export async function datosDelPedido() {
  const h = await headers();
  return { ip: h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '', navegador: h.get('user-agent') ?? '' };
}

export async function abrirSesion(usuarioId: string) {
  const token = randomBytes(32).toString('base64url');
  const { ip, navegador } = await datosDelPedido();
  const { rows } = await base.query<{ vence: Date }>('select servidor.abrir_sesion($1, $2, $3, $4) as vence', [usuarioId, huella(token), ip, navegador]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: rows[0].vence,
  });
  // al entrar se abre el depósito marcado con la estrellita (no el último que se eligió)
  (await cookies()).delete(COOKIE_DEL_DEPOSITO);
}

/** El usuario de esta sesión, o null. Una sola consulta por pedido aunque la pidan varias partes de la pantalla. */
export const usuarioActual = cache(async (): Promise<string | null> => usuarioDeSesion((await cookies()).get(COOKIE)?.value));

async function usuarioDeSesion(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const { rows } = await base.query<{ id: string | null }>('select servidor.usuario_de_sesion($1) as id', [huella(token)]);
  return rows[0]?.id ?? null;
}

/** Lo mismo, desde la cabecera Cookie de un pedido (donde no hay cookies(): los errores que nadie atrapó, ~/lib/registroDeErrores). */
export function usuarioDeLaCabecera(cabecera: string | undefined): Promise<string | null> {
  return usuarioDeSesion(cabecera?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1]);
}

/** Para las pantallas de adentro: sin sesión, a la de entrada. */
export async function exigirUsuario(): Promise<string> {
  const id = await usuarioActual();
  if (!id) redirect('/entrar');
  return id;
}

export async function cerrarSesion() {
  const almacen = await cookies();
  const token = almacen.get(COOKIE)?.value;
  if (token) await base.query('select servidor.cerrar_sesion($1)', [huella(token)]);
  almacen.delete(COOKIE);
}

/** Cierra las demás sesiones de quien tiene esta (la de este equipo queda abierta). */
export async function cerrarOtrasSesiones() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await base.query('select servidor.cerrar_otras_sesiones($1)', [huella(token)]);
}
