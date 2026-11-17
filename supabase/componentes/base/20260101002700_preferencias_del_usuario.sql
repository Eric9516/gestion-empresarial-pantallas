-- Preferencias de pantalla de cada persona (por ahora, dónde va el menú en la computadora y si queda fijo).
--
-- Se guardan en su perfil, así la siguen a cualquier computadora donde entre. Cada uno cambia solo las suyas (la función corre con los
-- permisos de quien llama: la regla de usuarios_perfil solo le deja tocar su propia fila) y la base valida los valores: no se puede guardar
-- cualquier cosa ni algo grande. No cuentan como un cambio de permisos (no pasan por el historial).

alter table public.usuarios_perfil
  add column if not exists preferencias jsonb not null default '{}'::jsonb;

alter table public.usuarios_perfil
  add constraint usuarios_perfil_preferencias_check check (
    jsonb_typeof(preferencias) = 'object'
    and octet_length(preferencias::text) <= 2000
    and (not preferencias ? 'menu_posicion' or preferencias ->> 'menu_posicion' in ('lateral', 'arriba', 'abajo'))
    and (not preferencias ? 'menu_fijo' or jsonb_typeof(preferencias -> 'menu_fijo') = 'boolean')
  );

-- Guarda solo lo que cambia (se suma a lo que ya había) y devuelve cómo quedaron.
create or replace function public.guardar_preferencias(p_cambios jsonb)
returns jsonb
language sql
security invoker
set search_path to 'public'
as $$
  update public.usuarios_perfil
     set preferencias = preferencias || coalesce(p_cambios, '{}'::jsonb)
   where id = (select auth.uid())
  returning preferencias;
$$;
revoke execute on function public.guardar_preferencias(jsonb) from public, anon;
grant execute on function public.guardar_preferencias(jsonb) to authenticated;
