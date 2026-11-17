-- Compras decide cómo trabaja cada depósito, y el Informe de reposición pasa a ser de Compras.
--
-- 1) El permiso "Gestionar depósitos" pasa a llamarse "Administrador de Compras" (la columna sigue siendo puede_gestionar_depositos: cambiarle el
--    nombre rompería las migraciones viejas que la nombran). Quien lo tiene crea y edita depósitos, decide qué usa cada uno (retiros,
--    reparaciones: ver la migración de Abastecimiento del mismo número) y ve el Informe de reposición.
-- 2) Permiso nuevo "Ver el informe de reposición" (puede_ver_informe): para alguien del depósito que también compra (como Mantenimiento en Cremac).
--    Lo da un dueño desde Configuración → Usuarios, como los demás. Quienes hoy ven el informe (los administradores del Depósito) lo reciben
--    tildado, así nadie pierde lo que ya usaba.

set check_function_bodies = off;

alter table public.usuarios_perfil add column if not exists puede_ver_informe boolean not null default false;

-- Antes de sumar el permiso al historial: tildarlo a quienes ya veían el informe no es un cambio de nadie.
update public.usuarios_perfil set puede_ver_informe = true where mantenimiento_rol = 'admin' and not puede_ver_informe;

-- Ve el Informe de reposición: un dueño, el administrador de Compras, o quien tenga el permiso y acceso al Depósito.
create or replace function public.can_ver_informe()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_owner() or exists (
    select 1 from usuarios_perfil
    where id = auth.uid() and activo is true
      and (puede_gestionar_depositos is true or (puede_ver_informe is true and mantenimiento_rol is not null))
  );
$$;
revoke execute on function public.can_ver_informe() from public, anon;
grant execute on function public.can_ver_informe() to authenticated;

-- Solo un dueño cambia este permiso (se suma a la lista de campos protegidos).
CREATE OR REPLACE FUNCTION public.proteger_campos_privilegiados()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not is_owner() then
    if (new.rol, new.mantenimiento_rol, new.puede_ver_retiros, new.puede_ver_errores,
        new.puede_resetear_contrasenas, new.puede_ver_sugerencias, new.puede_ajustar_inventario, new.puede_gestionar_depositos, new.puede_ver_auditoria,
        new.puede_ver_informe, new.activo, new.es_owner, new.access_status, new.access_expires_at, new.email)
       is distinct from
       (old.rol, old.mantenimiento_rol, old.puede_ver_retiros, old.puede_ver_errores,
        old.puede_resetear_contrasenas, old.puede_ver_sugerencias, old.puede_ajustar_inventario, old.puede_gestionar_depositos, old.puede_ver_auditoria,
        old.puede_ver_informe, old.activo, old.es_owner, old.access_status, old.access_expires_at, old.email) then
      raise exception 'No tenés permiso para cambiar roles ni permisos.';
    end if;
  end if;

  -- A un dueño no se lo puede bloquear: primero hay que sacarle el cargo.
  if new.es_owner and new.activo is not true then
    raise exception 'No se puede bloquear a un dueño del sistema. Quitale primero el cargo de dueño.';
  end if;

  return new;
end;
$function$;

-- Dar o sacar el permiso queda en el historial (y "gestionar depósitos" se anota con su nombre nuevo).
CREATE OR REPLACE FUNCTION public.fn_audit_log_usuarios()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor record;
  v_row record;
  v_desc text;
  v_cambios text;
  v_nombre text;
begin
  select * into v_actor from _aud_actor();
  v_row := coalesce(new, old);
  v_nombre := coalesce(nullif(trim(concat(v_row.nombre, ' ', v_row.apellido)), ''), v_row.email);
  v_desc := concat(v_nombre, ' (', v_row.email, ')');

  if tg_op = 'UPDATE' then
    v_cambios := concat_ws('; ',
      _aud_cambio('nombre', nullif(trim(concat(old.nombre, ' ', old.apellido)), ''), nullif(trim(concat(new.nombre, ' ', new.apellido)), '')),
      _aud_cambio('rol en Directorio',
        case old.rol when 'admin' then 'Administrador' when 'user' then 'Usuario' when 'disabled' then 'Desactivado' else old.rol end,
        case new.rol when 'admin' then 'Administrador' when 'user' then 'Usuario' when 'disabled' then 'Desactivado' else new.rol end),
      _aud_cambio('rol en Depósito',
        case old.mantenimiento_rol when 'admin' then 'Administrador' when 'comun' then 'Usuario' else 'Desactivado' end,
        case new.mantenimiento_rol when 'admin' then 'Administrador' when 'comun' then 'Usuario' else 'Desactivado' end),
      _aud_cambio('ver los retiros de todos', case when old.puede_ver_retiros then 'sí' else 'no' end, case when new.puede_ver_retiros then 'sí' else 'no' end),
      _aud_cambio('ver el log de errores', case when old.puede_ver_errores then 'sí' else 'no' end, case when new.puede_ver_errores then 'sí' else 'no' end),
      _aud_cambio('resetear contraseñas', case when old.puede_resetear_contrasenas then 'sí' else 'no' end, case when new.puede_resetear_contrasenas then 'sí' else 'no' end),
      _aud_cambio('ver sugerencias', case when old.puede_ver_sugerencias then 'sí' else 'no' end, case when new.puede_ver_sugerencias then 'sí' else 'no' end),
      _aud_cambio('ajustar el inventario', case when old.puede_ajustar_inventario then 'sí' else 'no' end, case when new.puede_ajustar_inventario then 'sí' else 'no' end),
      _aud_cambio('administrador de Compras', case when old.puede_gestionar_depositos then 'sí' else 'no' end, case when new.puede_gestionar_depositos then 'sí' else 'no' end),
      _aud_cambio('ver auditoría', case when old.puede_ver_auditoria then 'sí' else 'no' end, case when new.puede_ver_auditoria then 'sí' else 'no' end),
      _aud_cambio('ver el informe de reposición', case when old.puede_ver_informe then 'sí' else 'no' end, case when new.puede_ver_informe then 'sí' else 'no' end),
      case when old.activo is distinct from new.activo then case when new.activo then 'desbloqueado' else 'bloqueado' end end,
      case when old.es_owner is distinct from new.es_owner then case when new.es_owner then 'pasa a ser dueño del sistema' else 'deja de ser dueño del sistema' end end
    );
    v_desc := concat(v_desc, ' · ', v_cambios);
  end if;

  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    'usuarios_perfil',
    v_row.id::text,
    v_desc,
    lower(tg_op),
    auth.uid(),
    -- Las altas y bajas las ejecuta una función del servidor sin sesión de usuario.
    case when auth.uid() is null then 'Panel de usuarios' else v_actor.p_nombre end,
    v_actor.p_email,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_audit_usuarios_update on public.usuarios_perfil;

create trigger trg_audit_usuarios_update
  after update of nombre, apellido, rol, mantenimiento_rol, puede_ver_retiros, puede_ver_errores, puede_resetear_contrasenas, puede_ver_sugerencias,
    puede_ajustar_inventario, puede_gestionar_depositos, puede_ver_auditoria, puede_ver_informe, activo, es_owner
  on public.usuarios_perfil for each row
  when (
    old.nombre is distinct from new.nombre or old.apellido is distinct from new.apellido
    or old.rol is distinct from new.rol or old.mantenimiento_rol is distinct from new.mantenimiento_rol
    or old.puede_ver_retiros is distinct from new.puede_ver_retiros or old.puede_ver_errores is distinct from new.puede_ver_errores
    or old.puede_resetear_contrasenas is distinct from new.puede_resetear_contrasenas
    or old.puede_ver_sugerencias is distinct from new.puede_ver_sugerencias
    or old.puede_ajustar_inventario is distinct from new.puede_ajustar_inventario
    or old.puede_gestionar_depositos is distinct from new.puede_gestionar_depositos
    or old.puede_ver_auditoria is distinct from new.puede_ver_auditoria
    or old.puede_ver_informe is distinct from new.puede_ver_informe
    or old.activo is distinct from new.activo or old.es_owner is distinct from new.es_owner
  )
  execute function public.fn_audit_log_usuarios();

select public._funciones_a_la_app();
