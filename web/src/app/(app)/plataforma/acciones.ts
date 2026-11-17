'use server';
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { comoUsuario } from '~/lib/db';
import { Id, SiNo, Texto, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// El panel de la plataforma: las funciones de la base (esquema "plataforma", web/db/04-plataforma.sql) revisan que quien lo pide administre la
// plataforma; acá además se valida la forma de lo que llega y se arma la contraseña del dueño nuevo.

const MODULOS = ['proveedores', 'comisionistas', 'envios', 'deposito', 'mantenimiento', 'tareas'] as const;
const Licencia = z.object({
  modulos: z.object(Object.fromEntries(MODULOS.map(m => [m, SiNo])) as Record<(typeof MODULOS)[number], typeof SiNo>).strict(),
  maxDepositos: z.number().int().min(1).max(100),
});
// Los componentes (los bloques del sistema) salen de los módulos: la Base siempre; Abastecimiento si usa alguno de sus módulos; Mantenimiento
// si usa ese módulo (src/lib/modulos.json dice de qué componente es cada uno)
const componentesDe = (m: Record<(typeof MODULOS)[number], boolean>) => [
  'base',
  ...(m.proveedores || m.comisionistas || m.envios || m.deposito || m.mantenimiento ? ['abastecimiento'] : []),
  ...(m.mantenimiento ? ['mantenimiento'] : []),
];
export type LicenciaDeEmpresa = z.infer<typeof Licencia>;
const EmpresaNueva = z.object({ nombre: Texto(120), dueno: Texto(120), email: Texto(200) });
export type DatosDeEmpresaNueva = z.infer<typeof EmpresaNueva>;

type Resultado = { error: string | null };

// Una contraseña de 12 letras y números, sin los que se confunden al dictarla (0/O, 1/l/I)
const LETRAS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const contrasenaNueva = () => Array.from({ length: 12 }, () => LETRAS[randomInt(LETRAS.length)]).join('');

export async function crearEmpresa(datos: DatosDeEmpresaNueva, licencia: LicenciaDeEmpresa): Promise<Resultado & { contrasena?: string }> {
  const usuario = await entrada('crearEmpresa', [EmpresaNueva, Licencia], [datos, licencia]);
  const email = datos.email.trim().toLowerCase();
  if (!datos.nombre.trim() || !datos.dueno.trim()) return { error: 'Faltan el nombre de la empresa y el del dueño' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'El correo no es válido' };
  const contrasena = contrasenaNueva();
  try {
    await comoUsuario(usuario, async c => c.query('select plataforma.crear_empresa($1, $2, $3, $4, $5, $6, $7)', [
      datos.nombre.trim(), datos.dueno.trim(), email, await bcrypt.hash(contrasena, 10),
      JSON.stringify(licencia.modulos), componentesDe(licencia.modulos), licencia.maxDepositos,
    ]));
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo crear la empresa') };
  }
  revalidatePath('/plataforma');
  return { error: null, contrasena };
}

export async function cambiarLicencia(empresa: string, licencia: LicenciaDeEmpresa): Promise<Resultado> {
  const usuario = await entrada('cambiarLicencia', [Id, Licencia], [empresa, licencia]);
  try {
    await comoUsuario(usuario, c => c.query('select plataforma.cambiar_licencia($1, $2, $3, $4)',
      [empresa, JSON.stringify(licencia.modulos), componentesDe(licencia.modulos), licencia.maxDepositos]));
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo guardar la licencia') };
  }
  revalidatePath('/plataforma');
  return { error: null };
}

export async function cambiarEstado(empresa: string, activa: boolean): Promise<Resultado> {
  const usuario = await entrada('cambiarEstado', [Id, SiNo], [empresa, activa]);
  try {
    await comoUsuario(usuario, c => c.query('select plataforma.cambiar_estado($1, $2)', [empresa, activa]));
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo cambiar la empresa') };
  }
  revalidatePath('/plataforma');
  return { error: null };
}

export interface UsuarioDeEmpresa { id: string; nombre: string | null; email: string; es_owner: boolean; activo: boolean; ultimo_uso: string | null }

export async function usuariosDeEmpresa(empresa: string): Promise<UsuarioDeEmpresa[]> {
  const usuario = await entrada('usuariosDeEmpresa', [Id], [empresa]);
  return comoUsuario(usuario, async c =>
    (await c.query<UsuarioDeEmpresa>('select id, nombre, email, es_owner, activo, ultimo_uso from plataforma.usuarios_de($1)', [empresa])).rows);
}
