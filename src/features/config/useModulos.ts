import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { TODOS_ACTIVOS, integraciones, resolverModulos } from '../../lib/modulos';

// Módulos activos de esta instalación. Un módulo se usa si (1) la licencia lo incluye (solo la cambia quien
// vende, con "pnpm cliente modulos") y su componente está instalado, y (2) el dueño no lo apagó desde Configuración → Módulos.
// `modulos` ya descuenta los que no pueden funcionar porque les falta uno que necesitan, e `integ` dice qué
// funciones cruzadas existen. `contratados` y `apagados` sirven para la pantalla del dueño. `listo` es falso solo
// mientras se carga por primera vez: las pantallas esperan para no mostrar pestañas que desaparecen.
interface Crudo { modulos: unknown; componentes: unknown; apagados: unknown }

async function leerLicencia(): Promise<Crudo | null> {
  // "componentes" existe desde que se instaló la licencia por componentes; en una base más vieja se lee sin él.
  let fila: { modulos: unknown; componentes?: unknown } | null = null;
  const conComponentes = await supabase.from('licencia').select('modulos, componentes').eq('id', 1).maybeSingle();
  if (conComponentes.error) {
    const solo = await supabase.from('licencia').select('modulos').eq('id', 1).maybeSingle();
    if (solo.error) throw solo.error;
    fila = solo.data;
  } else fila = conComponentes.data;
  if (!fila) return null;
  // Las preferencias del dueño también son nuevas: si todavía no existen, no hay nada apagado.
  const pref = await supabase.from('preferencias_modulos').select('apagados').eq('id', 1).maybeSingle();
  return { modulos: fila.modulos, componentes: fila.componentes ?? null, apagados: pref.error ? {} : (pref.data?.apagados ?? {}) };
}

export function useModulos() {
  const { data, isLoading } = useQuery({
    queryKey: ['licencia'],
    queryFn: leerLicencia,
    staleTime: 60_000,
    // Se vuelve a leer cada minuto: un cambio de licencia llega a las pantallas abiertas sin recargar.
    refetchInterval: 60_000,
  });
  // Sin licencia leída (por ejemplo, un corte de conexión al abrir) no se oculta nada: la base de datos protege igual.
  const estado = useMemo(() => (data == null ? null : resolverModulos(data.modulos, data.componentes, data.apagados)), [data]);
  const modulos = estado?.activos ?? TODOS_ACTIVOS;
  const integ = useMemo(() => integraciones(modulos), [modulos]);
  return { modulos, integ, contratados: estado?.contratados ?? TODOS_ACTIVOS, apagados: estado?.apagados ?? {}, leida: estado != null, listo: !isLoading };
}
