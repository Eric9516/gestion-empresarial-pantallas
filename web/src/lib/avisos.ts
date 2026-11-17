import 'server-only';
import { LIMITE_DE_AVISOS } from '@/features/avisos/textoDeAviso';
import { puedeVerSugerencias, puedeVerTodosLosRetiros } from '@/lib/types';
import type { Contexto } from './contexto';
import { comoUsuario } from './db';

// Los avisos del menú (el número rojo): cuántas cosas nuevas hay para esta persona desde la última vez que abrió cada sección, como en
// src/features/avisos/useAvisos.ts. "Nuevo" lo decide la base (tabla avisos_vistos), no el reloj del celular. Se cuenta hasta LIMITE_DE_AVISOS.

export type ClaveDeAviso = 'retiros' | 'sugerencias';
export type Avisos = Record<ClaveDeAviso, number>;

/** De qué puede recibir avisos cada uno: los retiros de otros, quien los ve todos; las sugerencias, quien las lee. */
export function clavesDeAvisos({ perfil, modulos }: Contexto): ClaveDeAviso[] {
  return [
    ...(puedeVerTodosLosRetiros(perfil) && modulos.deposito ? ['retiros' as const] : []),
    ...(puedeVerSugerencias(perfil) ? ['sugerencias' as const] : []),
  ];
}

// Los retiros propios no avisan: el aviso es para lo que hicieron otros.
const NUEVOS: Record<ClaveDeAviso, string> = {
  retiros: `select 1 from public.retiros where created_at > $1 and usuario_id <> auth.uid() limit ${LIMITE_DE_AVISOS}`,
  sugerencias: `select 1 from public.sugerencias where created_at > $1 limit ${LIMITE_DE_AVISOS}`,
};

export function contarAvisos(usuarioId: string, claves: ClaveDeAviso[]): Promise<Avisos> {
  const avisos: Avisos = { retiros: 0, sugerencias: 0 };
  if (!claves.length) return Promise.resolve(avisos);
  return comoUsuario(usuarioId, async c => {
    const { rows } = await c.query<{ clave: ClaveDeAviso; visto_at: string }>(
      'select clave, visto_at from public.avisos_vistos where usuario_id = auth.uid() and clave = any($1)', [claves]);
    for (const clave of claves) {
      const visto = rows.find(r => r.clave === clave);
      // la primera vez no se avisa de lo que ya estaba: se deja marcado desde ahora
      if (!visto) await c.query('select public.marcar_aviso_visto(p_clave => $1)', [clave]);
      else avisos[clave] = (await c.query(NUEVOS[clave], [visto.visto_at])).rowCount ?? 0;
    }
    return avisos;
  });
}

export async function marcarVisto(usuarioId: string, clave: ClaveDeAviso): Promise<void> {
  await comoUsuario(usuarioId, c => c.query('select public.marcar_aviso_visto(p_clave => $1)', [clave]));
}
