-- Parte "base" de supabase/migrations/20260101000100_mejoras_plantilla.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Mejoras propias de la plantilla sobre el esquema base.

-- 1) Los usuarios nuevos arrancan con acceso "active" (antes quedaban en "trial", un
--    estado heredado que no vence ni cambia nada, pero confundía al verlo en el perfil).
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
    true,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- 2) Los dueños se agregan y quitan con agregar_dueno / quitar_dueno. La transferencia
--    vieja (que dejaba al dueño anterior sin el cargo) ya no se usa.
drop function if exists public.transferir_ownership(uuid);

-- 3) Esas funciones, igual que el resto de las de permisos, no se pueden llamar sin sesión.
revoke execute on function public.agregar_dueno(uuid) from public, anon;

revoke execute on function public.quitar_dueno(uuid) from public, anon;

-- 4) Primer dueño de una instalación nueva. Se ejecuta una sola vez, al instalar, con la
--    clave de servicio (nunca desde la app): el usuario ya tiene que existir en Auth.
--    Si ya hay un dueño, no hace nada y avisa, así no sirve para tomar el control después.
create or replace function public.definir_dueno_inicial(p_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from usuarios_perfil where es_owner) then
    raise exception 'Esta instalación ya tiene un dueño definido.';
  end if;
  update usuarios_perfil
     set es_owner = true, rol = 'admin', mantenimiento_rol = 'admin', activo = true
   where lower(email) = lower(p_email);
  if not found then
    raise exception 'No existe un usuario con el email %. Crealo primero en Authentication.', p_email;
  end if;
end;
$function$;

revoke execute on function public.definir_dueno_inicial(text) from public, anon, authenticated;

grant execute on function public.definir_dueno_inicial(text) to service_role;
