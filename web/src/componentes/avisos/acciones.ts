'use server';
import { z } from 'zod';
import { clavesDeAvisos, contarAvisos, marcarVisto, type Avisos, type ClaveDeAviso } from '~/lib/avisos';
import { contexto } from '~/lib/contexto';
import { entrada } from '~/lib/entrada';

/** Los avisos del menú de nuevo (el menú los pide cada tanto mientras la pantalla está abierta). */
export async function avisosDelMenu(): Promise<Avisos> {
  await entrada('avisosDelMenu');
  const ctx = await contexto();
  return contarAvisos(ctx.perfil.id, clavesDeAvisos(ctx));
}

/** "Ya lo vi": apaga el aviso también en los otros equipos de la persona. */
export async function marcarAvisoVisto(clave: ClaveDeAviso): Promise<void> {
  const id = await entrada('marcarAvisoVisto', [z.enum(['retiros', 'sugerencias'])], [clave]);
  await marcarVisto(id, clave);
}
