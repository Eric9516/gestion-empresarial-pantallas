import 'server-only';
import { cache } from 'react';
import { integraciones, resolverModulos, TODOS_ACTIVOS, type Modulos } from '@/lib/modulos';
import { leerPreferencias, type PreferenciasPantalla } from '@/lib/preferencias';
import type { Profile } from '@/lib/types';
import type { Database } from '@/lib/database.types';
import { comoUsuario } from './db';
import { exigirUsuario } from './sesion';

export type Deposito = Database['public']['Tables']['depositos']['Row'];

export interface Contexto {
  perfil: Profile;
  /** La empresa de la persona (cada dato es de una empresa: ver supabase/componentes/base/…_varias_empresas.sql). */
  empresaId: string;
  /** Administra la plataforma (las empresas del servidor): ve el panel de la plataforma. */
  esPlataforma: boolean;
  /** La cuenta es solo de administración (no es de ninguna empresa de clientes). */
  cuentaDePlataforma: boolean;
  modulos: Modulos;
  integ: ReturnType<typeof integraciones>;
  /**
   * Los depósitos activos de la persona; `deposito` es en el que está (el que eligió arriba, o el marcado con la estrellita, o el principal).
   * En `perfil.mantenimiento_rol` va su rol EN ESE depósito (la base lo guarda como resumen de todos): así las pantallas del Depósito
   * muestran lo que puede hacer ahí.
   */
  depositos: Deposito[];
  deposito: Deposito | undefined;
  /** El depósito marcado con la estrellita (se abre al entrar). */
  depositoPreferido: string | null;
  preferencias: PreferenciasPantalla;
}

/**
 * Quién es y qué puede usar: perfil, módulos activos y sus depósitos, en una sola ida a la base (y una sola vez por pedido,
 * aunque lo pidan la cabecera, el menú y la pantalla). Sin sesión, manda a /entrar.
 */
export const contexto = cache(async (): Promise<Contexto> => {
  const id = await exigirUsuario();
  return comoUsuario(id, async c => {
    // (van una tras otra: una conexión atiende una consulta por vez, así que en paralelo no ganaban nada)
    const perfil = await c.query<Profile & { empresa_id: string }>('select * from public.usuarios_perfil where id = auth.uid()');
    const plataforma = await c.query<{ es: boolean; cuenta: boolean }>('select plataforma.es_administrador() as es, plataforma.es_cuenta_de_plataforma() as cuenta');
    const licencia = await c.query<{ modulos: unknown; componentes: unknown }>('select modulos, componentes from public.licencia where id = 1');
    const preferencias = await c.query<{ apagados: unknown }>('select apagados from public.preferencias_modulos where id = 1');
    const depositos = await c.query<Deposito>('select * from public.depositos where activo order by codigo');
    const mios = await c.query<{ id: string }>('select id from public.depositos_del_usuario() as id');
    const actual = (await c.query<{ id: string | null; rol: 'admin' | 'comun' | null; preferido: string | null }>(`
      select public.deposito_actual() as id, public.rol_en_deposito(public.deposito_actual()) as rol,
             (select deposito_id from public.depositos_preferidos where usuario_id = auth.uid()) as preferido`)).rows[0];
    const fila = licencia.rows[0];
    const modulos = fila ? resolverModulos(fila.modulos, fila.componentes, preferencias.rows[0]?.apagados ?? {}).activos : TODOS_ACTIVOS;
    const suyos = new Set(mios.rows.map(r => r.id));
    const propios = depositos.rows.filter(d => suyos.has(d.id));
    return {
      perfil: perfil.rows[0] && { ...perfil.rows[0], mantenimiento_rol: actual?.rol ?? null },
      empresaId: perfil.rows[0]?.empresa_id,
      esPlataforma: plataforma.rows[0]?.es ?? false,
      cuentaDePlataforma: plataforma.rows[0]?.cuenta ?? false,
      modulos,
      integ: integraciones(modulos),
      depositos: propios,
      deposito: propios.find(d => d.id === actual?.id) ?? propios.find(d => d.es_principal) ?? propios[0],
      depositoPreferido: actual?.preferido ?? null,
      preferencias: leerPreferencias(perfil.rows[0]?.preferencias),
    };
  });
});
