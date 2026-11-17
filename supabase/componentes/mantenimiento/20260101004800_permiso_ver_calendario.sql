-- Permiso "Ver el calendario" de Mantenimiento: la columna está en base/…004800_permiso_ver_calendario.sql. Acá, que solo un dueño lo dé y que
-- quede en el historial (va en este componente porque se instala último: el del Depósito redefine la misma protección y la pisaría).

set check_function_bodies = off;

-- Solo un dueño cambia este permiso (se suma a la lista de campos protegidos; el resto, como en la última versión: abastecimiento/…004100).
create or replace function public.proteger_campos_privilegiados()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- (el resumen del rol del Depósito lo cambia la base aunque no lo haga un dueño: por ejemplo, al borrar un depósito)
  if current_setting('app.rol_derivado', true) = 'on' and pg_trigger_depth() > 1 then
    return new;
  end if;

  if not is_owner() then
    if (new.rol, new.mantenimiento_rol, new.rol_equipos, new.puede_ver_retiros, new.puede_ver_errores,
        new.puede_resetear_contrasenas, new.puede_ver_sugerencias, new.puede_ajustar_inventario, new.puede_gestionar_depositos, new.puede_ver_auditoria,
        new.puede_ver_informe, new.puede_ver_calendario, new.activo, new.es_owner, new.access_status, new.access_expires_at, new.email)
       is distinct from
       (old.rol, old.mantenimiento_rol, old.rol_equipos, old.puede_ver_retiros, old.puede_ver_errores,
        old.puede_resetear_contrasenas, old.puede_ver_sugerencias, old.puede_ajustar_inventario, old.puede_gestionar_depositos, old.puede_ver_auditoria,
        old.puede_ver_informe, old.puede_ver_calendario, old.activo, old.es_owner, old.access_status, old.access_expires_at, old.email) then
      raise exception 'No tenés permiso para cambiar roles ni permisos.';
    end if;
  end if;

  -- A un dueño no se lo puede bloquear: primero hay que sacarle el cargo.
  if new.es_owner and new.activo is not true then
    raise exception 'No se puede bloquear a un dueño del sistema. Quitale primero el cargo de dueño.';
  end if;

  return new;
end $$;

-- Dar o sacar el permiso queda en el historial (y el rol "Jefe de taller" se anota con su nombre).
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
      _aud_cambio('rol en Mantenimiento',
        case old.rol_equipos when 'admin' then 'Administrador' when 'jefe' then 'Jefe de taller' when 'tecnico' then 'Técnico' when 'consulta' then 'Solo consulta' else 'Sin acceso' end,
        case new.rol_equipos when 'admin' then 'Administrador' when 'jefe' then 'Jefe de taller' when 'tecnico' then 'Técnico' when 'consulta' then 'Solo consulta' else 'Sin acceso' end),
      _aud_cambio('ver los retiros de todos', case when old.puede_ver_retiros then 'sí' else 'no' end, case when new.puede_ver_retiros then 'sí' else 'no' end),
      _aud_cambio('ver el log de errores', case when old.puede_ver_errores then 'sí' else 'no' end, case when new.puede_ver_errores then 'sí' else 'no' end),
      _aud_cambio('resetear contraseñas', case when old.puede_resetear_contrasenas then 'sí' else 'no' end, case when new.puede_resetear_contrasenas then 'sí' else 'no' end),
      _aud_cambio('ver sugerencias', case when old.puede_ver_sugerencias then 'sí' else 'no' end, case when new.puede_ver_sugerencias then 'sí' else 'no' end),
      _aud_cambio('ajustar el inventario', case when old.puede_ajustar_inventario then 'sí' else 'no' end, case when new.puede_ajustar_inventario then 'sí' else 'no' end),
      _aud_cambio('administrador de Compras', case when old.puede_gestionar_depositos then 'sí' else 'no' end, case when new.puede_gestionar_depositos then 'sí' else 'no' end),
      _aud_cambio('ver auditoría', case when old.puede_ver_auditoria then 'sí' else 'no' end, case when new.puede_ver_auditoria then 'sí' else 'no' end),
      _aud_cambio('ver el informe de reposición', case when old.puede_ver_informe then 'sí' else 'no' end, case when new.puede_ver_informe then 'sí' else 'no' end),
      _aud_cambio('ver el calendario de Mantenimiento', case when old.puede_ver_calendario then 'sí' else 'no' end, case when new.puede_ver_calendario then 'sí' else 'no' end),
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
  after update of nombre, apellido, rol, mantenimiento_rol, rol_equipos, puede_ver_retiros, puede_ver_errores, puede_resetear_contrasenas,
    puede_ver_sugerencias, puede_ajustar_inventario, puede_gestionar_depositos, puede_ver_auditoria, puede_ver_informe, puede_ver_calendario, activo, es_owner
  on public.usuarios_perfil for each row
  when (
    old.nombre is distinct from new.nombre or old.apellido is distinct from new.apellido
    or old.rol is distinct from new.rol or old.mantenimiento_rol is distinct from new.mantenimiento_rol
    or old.rol_equipos is distinct from new.rol_equipos
    or old.puede_ver_retiros is distinct from new.puede_ver_retiros or old.puede_ver_errores is distinct from new.puede_ver_errores
    or old.puede_resetear_contrasenas is distinct from new.puede_resetear_contrasenas
    or old.puede_ver_sugerencias is distinct from new.puede_ver_sugerencias
    or old.puede_ajustar_inventario is distinct from new.puede_ajustar_inventario
    or old.puede_gestionar_depositos is distinct from new.puede_gestionar_depositos
    or old.puede_ver_auditoria is distinct from new.puede_ver_auditoria
    or old.puede_ver_informe is distinct from new.puede_ver_informe
    or old.puede_ver_calendario is distinct from new.puede_ver_calendario
    or old.activo is distinct from new.activo or old.es_owner is distinct from new.es_owner
  )
  execute function public.fn_audit_log_usuarios();

select public._funciones_a_la_app();
