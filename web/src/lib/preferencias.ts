'use server';
import { revalidatePath } from 'next/cache';
import type { PreferenciasPantalla } from '@/lib/preferencias';
import { z } from 'zod';
import { comoUsuario } from './db';
import { entrada } from './entrada';

// (la base valida los valores; acá, que sea un objeto con lo que se puede elegir)
const Cambios = z.object({ menu_posicion: z.string().max(20).optional(), menu_fijo: z.boolean().optional(), pdf_letra: z.string().max(20).optional() });

/** Guarda una preferencia de pantalla de quien tiene la sesión (la base valida los valores) y redibuja con el cambio. */
export async function guardarPreferencias(cambios: PreferenciasPantalla) {
  const id = await entrada('guardarPreferencias', [Cambios], [cambios]);
  await comoUsuario(id, c => c.query('select public.guardar_preferencias($1::jsonb)', [JSON.stringify(cambios)]));
  revalidatePath('/', 'layout');
}
