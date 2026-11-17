'use server';
import { z } from 'zod';
import { TIPOS_DE_AVISO } from '@/features/mantenimiento/avisosCelular';
import { mandarAvisos } from '~/lib/avisosAlCelular';
import { comoUsuario } from '~/lib/db';
import { Id, SiNo, Texto, entrada } from '~/lib/entrada';
import { mensajeDe } from '~/lib/registroDeErrores';

// Los avisos al celular de Mantenimiento: activarlos en este celular (cada persona) y, en Configuración → Mantenimiento → Avisos, prenderlos
// o apagarlos por persona (el dueño y el responsable). La base decide quién puede cada cosa (…_avisos_al_celular.sql).

type Resultado = { error: string | null };

const Celular = z.object({
  endpoint: z.url().max(1000).startsWith('https://'),
  p256dh: z.string().min(20).max(200),
  auth: z.string().min(10).max(100),
});

/** Anota este celular para recibir los avisos (o lo vuelve a anotar: el navegador puede cambiar la dirección). */
export async function guardarCelular(celular: z.infer<typeof Celular>, navegador: string): Promise<Resultado> {
  const usuario = await entrada('guardarCelular', [Celular, Texto(300)], [celular, navegador]);
  try {
    await comoUsuario(usuario, c => c.query('select public.guardar_celular($1, $2, $3, $4)', [celular.endpoint, celular.p256dh, celular.auth, navegador.slice(0, 200)]));
    return { error: null };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudieron activar los avisos') };
  }
}

/** Deja de mandarle avisos a este celular. */
export async function quitarCelular(endpoint: string): Promise<Resultado> {
  const usuario = await entrada('quitarCelular', [Texto(1000)], [endpoint]);
  try {
    await comoUsuario(usuario, c => c.query('select public.quitar_celular($1)', [endpoint]));
    return { error: null };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudieron desactivar los avisos') };
  }
}

/** Un aviso de prueba (a uno mismo, o el dueño y el responsable a cualquiera del área). Sale al momento. */
export async function probarAviso(aQuien: string | null): Promise<Resultado & { celulares: number }> {
  const usuario = await entrada('probarAviso', [Id.nullable()], [aQuien]);
  try {
    const celulares = await comoUsuario(usuario, async c => (await c.query<{ n: number }>('select public.probar_aviso($1) as n', [aQuien])).rows[0]?.n ?? 0);
    void mandarAvisos().catch(() => {});
    return { error: null, celulares };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo mandar el aviso de prueba'), celulares: 0 };
  }
}

export interface PersonaConAvisos { id: string; nombre: string; rol: 'responsable' | 'jefe' | 'tecnico'; celulares: number; apagados: string[] }

/** Configuración → Mantenimiento → Avisos: los del área, en cuántos celulares activaron los avisos y qué tienen apagado. */
export async function avisosDelEquipo(): Promise<{ personas: PersonaConAvisos[]; error: string | null }> {
  const usuario = await entrada('avisosDelEquipo');
  try {
    const { rows } = await comoUsuario(usuario, c => c.query<{ usuario_id: string; nombre: string; rol: PersonaConAvisos['rol']; celulares: number; apagados: string[] }>(
      'select * from public.avisos_del_equipo()'));
    return { personas: rows.map(r => ({ id: r.usuario_id, nombre: r.nombre, rol: r.rol, celulares: r.celulares, apagados: r.apagados })), error: null };
  } catch (e) {
    return { personas: [], error: mensajeDe(e, 'No se pudieron leer los avisos') };
  }
}

/** Prender o apagar un aviso a una persona. */
export async function cambiarAviso(persona: string, tipo: (typeof TIPOS_DE_AVISO)[number], activo: boolean): Promise<Resultado> {
  const usuario = await entrada('cambiarAviso', [Id, z.enum(TIPOS_DE_AVISO), SiNo], [persona, tipo, activo]);
  try {
    await comoUsuario(usuario, c => c.query('select public.cambiar_aviso($1, $2, $3)', [persona, tipo, activo]));
    return { error: null };
  } catch (e) {
    return { error: mensajeDe(e, 'No se pudo cambiar el aviso') };
  }
}
