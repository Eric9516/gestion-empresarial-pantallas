import 'server-only';
import { cache } from 'react';
import { comoUsuario } from './db';
import type { Contexto } from './contexto';

// Cómo trabaja el depósito de la persona (lo decide Compras: ver supabase/componentes/abastecimiento/…_como_trabaja_cada_deposito.sql).
// Además de lo básico (buscar, recibir mercadería, ajustes y movimientos), si los operarios retiran artículos y si manda cosas a reparar.
export interface ComoTrabaja { retiros: boolean; reparaciones: boolean }

// Sin depósito propio (alguien que no es de ninguno) queda como siempre: la base decide igual.
export const usaDelDeposito = ({ deposito }: Pick<Contexto, 'deposito'>): ComoTrabaja =>
  ({ retiros: deposito?.usa_retiros ?? true, reparaciones: deposito?.usa_reparaciones ?? true });

/**
 * Qué secciones se muestran: lo que el depósito usa y, aunque Compras lo haya apagado, lo que ya tiene historia (apagar no borra nada: los retiros
 * de antes se siguen consultando y una reparación pendiente se recibe). Solo pregunta a la base por lo que está apagado.
 */
export const seccionesQueSeVen = cache(async (ctx: Contexto): Promise<ComoTrabaja> => {
  const usa = usaDelDeposito(ctx);
  if (usa.retiros && usa.reparaciones) return usa;
  return comoUsuario(ctx.perfil.id, async c => ({
    retiros: usa.retiros || (await c.query<{ hay: boolean }>('select exists (select 1 from public.retiros) as hay')).rows[0].hay,
    reparaciones: usa.reparaciones || (await c.query<{ hay: boolean }>('select exists (select 1 from public.reparaciones) as hay')).rows[0].hay,
  }));
});
