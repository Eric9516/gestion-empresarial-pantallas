import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { puedeVerSugerencias, puedeVerTodosLosRetiros } from '../../lib/types';
import { useModulos } from '../config/useModulos';

// Los avisos del menú (el número rojo): cuántas cosas nuevas hay para esta persona desde la última vez que abrió cada sección.
// "Nuevo" lo decide la base: se compara con la hora en que se vio por última vez (tabla avisos_vistos), no con el reloj del celular.
// Se cuenta hasta LIMITE (y se muestra "99+"): no hace falta saber cuántas son si hay cientos, y así la consulta nunca pesa.
export const LIMITE_DE_AVISOS = 100;
const CADA_CUANTO = 30_000;

export type ClaveDeAviso = 'retiros' | 'sugerencias';

// El texto del número: "99+" si son muchos.
export const textoDeAviso = (n: number) => (n >= LIMITE_DE_AVISOS ? `${LIMITE_DE_AVISOS - 1}+` : String(n));

async function contarNuevos(clave: ClaveDeAviso, uid: string): Promise<number> {
  const { data: visto, error } = await supabase.from('avisos_vistos').select('visto_at').eq('usuario_id', uid).eq('clave', clave).maybeSingle();
  if (error) throw error;
  if (!visto) {
    // La primera vez no se avisa de lo que ya estaba: se deja marcado desde ahora.
    await supabase.rpc('marcar_aviso_visto', { p_clave: clave });
    return 0;
  }
  // Los retiros propios no avisan: el aviso es para lo que hicieron otros.
  const consulta = clave === 'retiros'
    ? supabase.from('retiros').select('id').gt('created_at', visto.visto_at).neq('usuario_id', uid)
    : supabase.from('sugerencias').select('id').gt('created_at', visto.visto_at);
  const { data, error: errorLista } = await consulta.limit(LIMITE_DE_AVISOS);
  if (errorLista) throw errorLista;
  return data?.length ?? 0;
}

function useNuevos(clave: ClaveDeAviso, habilitado: boolean): number {
  const { profile } = useAuth();
  const uid = profile?.id;
  const { data } = useQuery({
    queryKey: ['avisos', clave, uid ?? ''],
    enabled: habilitado && !!uid,
    queryFn: () => contarNuevos(clave, uid!),
    refetchInterval: CADA_CUANTO,
    refetchOnWindowFocus: true,
    // Es un adorno del menú: si falla, no se reintenta ni se molesta a nadie.
    retry: false,
  });
  return habilitado ? (data ?? 0) : 0;
}

export function useAvisos() {
  const { profile } = useAuth();
  const { modulos } = useModulos();
  const client = useQueryClient();
  const uid = profile?.id;

  const retiros = useNuevos('retiros', puedeVerTodosLosRetiros(profile) && modulos.deposito);
  const sugerencias = useNuevos('sugerencias', puedeVerSugerencias(profile));

  // "Ya lo vi": apaga el aviso al instante y se lo avisa a la base para que también se apague en los otros equipos.
  const marcarVisto = useCallback((clave: ClaveDeAviso) => {
    if (uid) client.setQueryData(['avisos', clave, uid], 0);
    // Las consultas de supabase-js no salen hasta que se les pide el resultado: por eso el .then (un "void" solo no la enviaría).
    supabase.rpc('marcar_aviso_visto', { p_clave: clave }).then(() => undefined, () => undefined);
  }, [client, uid]);

  return { retiros, sugerencias, total: retiros + sugerencias, marcarVisto };
}
