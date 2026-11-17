'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { base, comoUsuario } from '~/lib/db';
import { COOKIE_EMPRESA } from '~/lib/empresa';
import { abrirSesion, cerrarSesion, datosDelPedido } from '~/lib/sesion';

export type EstadoEntrada = { error: string | null; email: string };

// Si el correo no existe se compara igual contra esta huella, así la respuesta tarda lo mismo y no delata qué correos hay.
// (es la huella de un texto al azar, no de una contraseña de nadie)
// nosemgrep: detected-bcrypt-hash
const HUELLA_DE_RELLENO = '$2b$10$iYaad/P.0pgUqwU.uLYc8OpV/shxWXtohAvObAROqaJOLHzf/uAcO';

export async function entrar(_: EstadoEntrada, datos: FormData): Promise<EstadoEntrada> {
  const email = String(datos.get('email') ?? '').trim();
  const contrasena = String(datos.get('contrasena') ?? '');
  if (!email || !contrasena) return { error: 'Completá email y contraseña', email };

  const { ip } = await datosDelPedido();
  const { rows: [permiso] } = await base.query<{ ok: boolean }>('select servidor.puede_intentar($1, $2) as ok', [email, ip]);
  if (!permiso.ok) return { error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.', email };

  const { rows: [cuenta] } = await base.query<{ id: string; hash: string | null; activo: boolean }>(
    'select id, hash, activo from servidor.datos_para_entrar($1)', [email]);
  const coincide = await bcrypt.compare(contrasena, cuenta?.hash ?? HUELLA_DE_RELLENO);
  await base.query('select servidor.registrar_intento($1, $2, $3)', [email, ip, coincide]);

  if (!cuenta || !coincide) return { error: 'Email o contraseña incorrectos', email };
  if (!cuenta.activo) return { error: 'Tu cuenta está desactivada. Pedile al administrador que la active.', email };

  await abrirSesion(cuenta.id);
  // la próxima vez, la pantalla de entrada ya muestra el nombre y el logo de su empresa
  const { rows: [suya] } = await comoUsuario(cuenta.id, c => c.query<{ e: string | null }>('select public.empresa_actual() as e'));
  if (suya?.e) (await cookies()).set(COOKIE_EMPRESA, suya.e, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600,
  });
  redirect('/');
}

export async function salir() {
  await cerrarSesion();
  redirect('/entrar');
}
