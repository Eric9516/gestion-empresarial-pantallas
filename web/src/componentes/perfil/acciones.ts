'use server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { LARGO_MINIMO_CLAVE } from '@/features/perfil/permisos';
import { base, comoUsuario } from '~/lib/db';
import { Texto, TextoONulo, entrada } from '~/lib/entrada';
import { cerrarOtrasSesiones as cerrarLasOtras, datosDelPedido } from '~/lib/sesion';

// El menú de la persona: Mi perfil (nombre, contraseña propia, cerrar las otras sesiones) y Enviar sugerencia.

const texto = (v: unknown, largo: number) => String(v ?? '').trim().slice(0, largo);

// Lo que reciben las acciones (lo revisa entrada(): ver ~/lib/entrada)
const MiPerfil = z.object({ nombre: TextoONulo(300), apellido: TextoONulo(300) });

export async function guardarMiPerfil(datos: { nombre: string; apellido: string }): Promise<{ error: string | null }> {
  const usuario = await entrada('guardarMiPerfil', [MiPerfil], [datos]);
  if (!texto(datos?.nombre, 120)) return { error: 'El nombre es obligatorio' };
  try {
    await comoUsuario(usuario, c => c.query('update public.usuarios_perfil set nombre = $2, apellido = $3 where id = $1',
      [usuario, texto(datos.nombre, 120), texto(datos.apellido, 120)]));
  } catch {
    return { error: 'No se pudo guardar el perfil' };
  }
  revalidatePath('/', 'layout');
  return { error: null };
}

/** Primero se comprueba la contraseña actual: si alguien deja la computadora abierta, no puede cambiarle la clave a la persona. */
export async function cambiarMiContrasena(actual: string, nueva: string): Promise<{ error: string | null }> {
  const usuario = await entrada('cambiarMiContrasena', [Texto(200), Texto(200)], [actual, nueva]);
  if (typeof nueva !== 'string' || nueva.length < LARGO_MINIMO_CLAVE || nueva.length > 200) {
    return { error: `La contraseña nueva debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres` };
  }
  const { rows: [perfil] } = await comoUsuario(usuario, c => c.query<{ email: string }>('select email from public.usuarios_perfil where id = $1', [usuario]));
  if (!perfil?.email) return { error: 'No se pudo identificar tu cuenta' };
  // (cuenta como un intento de entrar: el mismo freno a quien prueba contraseñas)
  const { ip } = await datosDelPedido();
  const { rows: [permiso] } = await base.query<{ ok: boolean }>('select servidor.puede_intentar($1, $2) as ok', [perfil.email, ip]);
  if (!permiso.ok) return { error: 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' };
  const { rows: [cuenta] } = await base.query<{ id: string; hash: string | null }>('select id, hash from servidor.datos_para_entrar($1)', [perfil.email]);
  const coincide = cuenta?.id === usuario && !!cuenta.hash && await bcrypt.compare(String(actual ?? ''), cuenta.hash);
  await base.query('select servidor.registrar_intento($1, $2, $3)', [perfil.email, ip, coincide]);
  if (!coincide) return { error: 'La contraseña actual no es correcta' };
  try {
    await base.query('select servidor.cambiar_mi_contrasena($1, $2)', [usuario, await bcrypt.hash(nueva, 10)]);
  } catch {
    return { error: 'No se pudo cambiar la contraseña' };
  }
  return { error: null };
}

export async function cerrarOtrasSesiones(): Promise<{ error: string | null }> {
  await entrada('cerrarOtrasSesiones');
  try {
    await cerrarLasOtras();
  } catch {
    return { error: 'No se pudo cerrar' };
  }
  return { error: null };
}

export async function enviarSugerencia(mensaje: string): Promise<{ error: string | null }> {
  const usuario = await entrada('enviarSugerencia', [Texto(5000)], [mensaje]);
  if (!texto(mensaje, 2000)) return { error: 'Escribí algo antes de enviar' };
  try {
    await comoUsuario(usuario, c => c.query('insert into public.sugerencias (usuario_id, mensaje) values ($1, $2)', [usuario, texto(mensaje, 2000)]));
  } catch {
    return { error: 'No se pudo enviar' };
  }
  return { error: null };
}
