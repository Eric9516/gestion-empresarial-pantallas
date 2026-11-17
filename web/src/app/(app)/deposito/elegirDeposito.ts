'use server';
import { cookies } from 'next/headers';
import { comoUsuario, COOKIE_DEL_DEPOSITO } from '~/lib/db';
import { Id, IdONulo, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// El selector de depósito de arriba: en cuál trabajar ahora (queda en este navegador hasta salir) y cuál se abre al entrar (la estrellita,
// guardada en la base). La base revisa que el depósito sea de la persona: elegir uno ajeno no da acceso a nada.

const esId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

export async function elegirDeposito(id: string): Promise<{ error: string | null }> {
  const usuario = await entrada('elegirDeposito', [Id], [id]);
  if (!esId(id)) return { error: 'Depósito no válido' };
  const suyo = await comoUsuario(usuario, async c => (await c.query<{ ok: boolean }>('select $1::uuid = any (public.mis_depositos()) as ok', [id])).rows[0]?.ok);
  if (!suyo) return { error: 'No tenés acceso a ese depósito.' };
  (await cookies()).set(COOKIE_DEL_DEPOSITO, id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  return { error: null };
}

/** null = sacar la estrellita (al entrar se abre el principal). */
export async function marcarDepositoPreferido(id: string | null): Promise<{ error: string | null }> {
  const usuario = await entrada('marcarDepositoPreferido', [IdONulo], [id]);
  try {
    await comoUsuario(usuario, c => c.query('select public.marcar_deposito_preferido($1)', [esId(id) ? id : null]));
    return { error: null };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo marcar el depósito') };
  }
}
