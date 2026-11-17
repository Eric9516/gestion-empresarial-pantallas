-- Seguridad, fase 1 (parte de la Base). Sale de la auditoría del 2026-10-17 (ver docs/AUDITORIA-BASE-DE-DATOS.md).
--
-- 1) Un usuario nuevo nace BLOQUEADO. Hasta ahora, cualquier cuenta que se creara en el sistema de acceso (por ejemplo, si quedara abierto el
--    registro público, o una cuenta creada a mano desde el panel de Supabase) recibía al instante un perfil activo con acceso al Directorio.
--    Las altas de verdad no cambian: la función que crea usuarios (create-user) y la que define al primer dueño los dejan activos a propósito.
-- 2) Los usuarios con sesión no necesitan los permisos TRUNCATE, REFERENCES ni TRIGGER sobre las tablas (TRUNCATE, además, no respeta las reglas
--    por fila). Se quitan de las tablas que existen y de las que se creen después. La aplicación no los usa.

set check_function_bodies = off;

-- 1) Usuarios nuevos: bloqueados hasta que un dueño los habilite.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.usuarios_perfil (id, nombre, apellido, email, rol, activo, access_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    '',
    coalesce(new.email, ''),
    'user',
    false,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- 2) Quitar los permisos que sobran. Es una función para que cada componente la use al final de su propia migración (sus tablas).
--    Nadie con sesión la puede ejecutar: solo corre dentro de las migraciones.
create or replace function public._quitar_permisos_sobrantes()
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  t record;
begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', t.relname);
  end loop;
end;
$function$;
revoke execute on function public._quitar_permisos_sobrantes() from public, anon, authenticated;

select public._quitar_permisos_sobrantes();
-- y en las tablas que se creen de acá en adelante
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
