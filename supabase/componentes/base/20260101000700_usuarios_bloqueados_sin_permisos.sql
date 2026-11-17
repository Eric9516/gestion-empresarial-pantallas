-- Parte "base" de supabase/migrations/20260101000700_usuarios_bloqueados_sin_permisos.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Un usuario bloqueado (activo = false) deja de tener permisos en la base, no solo en la pantalla.
--
-- Hallazgo de la prueba exhaustiva: "Bloquear" solo lo comprobaba la pantalla al iniciar sesión. Quien ya tenía la
-- sesión abierta seguía trabajando, y por la API directa un usuario bloqueado podía iniciar sesión y leer y escribir
-- con sus permisos. Ahora todas las reglas exigen un usuario activo.

create or replace function public.usuario_activo()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select activo is true from public.usuarios_perfil where id = auth.uid()), false);
$$;

revoke execute on function public.usuario_activo() from public, anon;

grant execute on function public.usuario_activo() to authenticated, service_role;

-- Las funciones que deciden "quién puede qué" ahora también piden que la persona esté activa.
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select es_owner and activo is true from usuarios_perfil where id = auth.uid()), false);
$$;

create or replace function public.is_directorio_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios_perfil where id = auth.uid() and rol = 'admin' and activo is true) or is_owner();
$$;

create or replace function public.is_mantenimiento_admin()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios_perfil where id = auth.uid() and mantenimiento_rol = 'admin' and activo is true) or is_owner();
$$;

create or replace function public.tiene_acceso_mantenimiento()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios_perfil where id = auth.uid() and mantenimiento_rol is not null and activo is true) or is_mantenimiento_admin();
$$;

create or replace function public.is_admin(user_uuid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios_perfil where id = user_uuid and rol = 'admin' and activo is true) or is_owner();
$$;

create or replace function public.has_active_access(user_uuid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.usuarios_perfil
    where id = user_uuid
      and activo is true
      and access_status in ('active', 'trial')
      and (access_expires_at is null or access_expires_at > now())
  );
$$;

create or replace function public.can_view_all_retiros()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios_perfil where id = auth.uid() and puede_ver_retiros = true and activo is true) or is_owner();
$$;

create or replace function public.can_view_errores()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios_perfil where id = auth.uid() and puede_ver_errores = true and activo is true) or is_owner();
$$;

-- La papelera es solo del dueño. La versión anterior leía una columna ("puede_ver_papelera") que no existe y no se usaba en ningún lado.
create or replace function public.can_view_papelera()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_owner();
$$;

create or replace function public.can_view_sugerencias()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from usuarios_perfil where id = auth.uid() and puede_ver_sugerencias = true and activo is true) or is_owner();
$$;

CREATE OR REPLACE FUNCTION public.get_user_task_counts(target_user_id uuid)
 RETURNS TABLE(total bigint, pending bigint, completed bigint, cancelled bigint, stagnant bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed,
    COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT AS cancelled,
    COUNT(*) FILTER (WHERE is_stagnant = true AND status = 'pending')::BIGINT AS stagnant
  FROM public.tasks
  WHERE user_id = target_user_id
    AND public.modulo_activo('tareas') AND public.usuario_activo()
    AND (target_user_id = auth.uid() OR public.is_admin(auth.uid()));
$function$;

-- Una regla más por tabla: sin usuario activo no se lee ni se escribe nada. Se suma a las que ya había
-- (las reglas "restrictivas" se combinan con "y"). Solo se exceptúan la configuración (la lee el ingreso), la licencia
-- y los perfiles, que tienen su propia regla de abajo.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
      and c.relname = any (array['usuarios_perfil', 'configuracion', 'licencia', 'audit_log', 'error_logs', 'sugerencias', 'tasks', 'task_history', 'migraciones_aplicadas'])
      and c.relname not in ('configuracion', 'licencia', 'usuarios_perfil', 'migraciones_aplicadas')
  loop
    execute format('drop policy if exists requiere_usuario_activo on public.%I', t);
    execute format(
      'create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
end $$;

-- Un bloqueado puede leer solo su propio perfil (la pantalla lo necesita para avisarle que está desactivado).
drop policy if exists requiere_usuario_activo_lectura on public.usuarios_perfil;

create policy requiere_usuario_activo_lectura on public.usuarios_perfil as restrictive for select to authenticated
  using (id = (select auth.uid()) or (select public.usuario_activo()));

drop policy if exists requiere_usuario_activo_escritura on public.usuarios_perfil;

create policy requiere_usuario_activo_escritura on public.usuarios_perfil as restrictive for update to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

-- Lo mismo para los archivos.
drop policy if exists requiere_usuario_activo on storage.objects;

create policy requiere_usuario_activo on storage.objects as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));
