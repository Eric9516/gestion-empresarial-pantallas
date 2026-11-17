import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { comoAnonimo, comoUsuario } from './db';
import { usuarioActual } from './sesion';

/**
 * `colorPrimario`: el color que eligió la empresa (Configuración → Empresa); null = el azul de la app. `huella`: cambia cuando se cambia
 * el logo (va en la dirección del ícono de la app instalada, para que se actualice).
 */
export type Empresa = { nombre: string; logo: string | null; colorPrimario: string | null; huella: string | null };

/** La empresa de la última persona que entró en este navegador: para la pantalla de entrada, antes de saber quién es. */
export const COOKIE_EMPRESA = 'empresa';
const ES_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La empresa de quien tiene la sesión abierta (null sin sesión, o si es una cuenta de la plataforma, que no es de ninguna empresa). */
const empresaDeLaSesion = cache(async (): Promise<string | null> => {
  const usuario = await usuarioActual();
  if (!usuario) return null;
  return comoUsuario(usuario, async c => (await c.query<{ e: string | null }>('select public.empresa_actual() as e')).rows[0]?.e ?? null);
});

/**
 * La empresa pedida; si no, la de la sesión abierta; si no, la de la cookie (la última que entró en este navegador). Con una sola empresa
 * en la base da igual. (La sesión va antes que la cookie: quien entró antes de que existiera la cookie no la tiene.)
 */
async function cual(id?: string | null): Promise<string | null> {
  if (id && ES_ID.test(id)) return id;
  const deLaSesion = await empresaDeLaSesion().catch(() => null);
  if (deLaSesion) return deLaSesion;
  const deLaCookie = (await cookies()).get(COOKIE_EMPRESA)?.value;
  return deLaCookie && ES_ID.test(deLaCookie) ? deLaCookie : null;
}

/** La empresa de este pedido (null si no se sabe): para las direcciones que el navegador pide sin cookies (ícono, manifiesto). */
export const empresaDelPedido = () => cual(null);

/**
 * El nombre y el logo de la empresa (los puede ver cualquiera: salen en la pantalla de entrada). El logo va como dirección (/logo?v=…) y no
 * metido en la pantalla: así el navegador lo baja una sola vez y lo guarda; la "v" es su huella, que cambia cuando se cambia el logo.
 */
export const empresa = cache(async (id?: string | null): Promise<Empresa> => {
  const e = await cual(id);
  const fila = await comoAnonimo(async c => (await c.query<{ empresa_nombre: string | null; version: string | null; color_primario: string | null }>(
    `select empresa_nombre, left(md5(nullif(logo_base64, '')), 12) as version, color_primario from public.configuracion limit 1`)).rows[0], e);
  return {
    nombre: fila?.empresa_nombre || 'Mi Empresa', logo: fila?.version ? `/logo?${e ? `e=${e}&` : ''}v=${fila.version}` : null,
    colorPrimario: fila?.color_primario ?? null, huella: fila?.version ?? null,
  };
});

/** El logo tal como está guardado (data:image/…;base64,…): para los PDF, que lo necesitan adentro, y para servirlo en /logo. */
export const logoEnBase64 = cache(async (id?: string | null): Promise<string | null> => {
  const fila = await comoAnonimo(async c =>
    (await c.query<{ logo_base64: string | null }>('select logo_base64 from public.configuracion limit 1')).rows[0], await cual(id));
  return fila?.logo_base64 || null;
});
