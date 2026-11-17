-- El historial de la licencia: los cambios que hace la plataforma (sin un usuario de la empresa) figuran como "Plataforma" (antes decía
-- "Administración del sistema", que se confundía con un usuario de la empresa), y el tope de depósitos también queda anotado (antes solo
-- se anotaban los módulos y los componentes: bajar de 100 a 5 depósitos no dejaba rastro).

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fn_audit_log_licencia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes jsonb := case when tg_op = 'UPDATE' then old.modulos else '{}'::jsonb end;
  v_cambios text;
begin
  if tg_op = 'UPDATE' and new.modulos is not distinct from v_antes and new.componentes is not distinct from old.componentes
     and new.max_depositos is not distinct from old.max_depositos then
    return new;
  end if;
  select string_agg(k || ': ' || case when coalesce(new.modulos ->> k, 'false') = 'true' then 'activo' else 'apagado' end, '; ' order by k)
    into v_cambios
  from (select key as k from jsonb_each(new.modulos) union select key from jsonb_each(v_antes)) claves
  where coalesce(v_antes ->> k, 'false') is distinct from coalesce(new.modulos ->> k, 'false') or tg_op = 'INSERT';
  if tg_op = 'INSERT' or new.componentes is distinct from old.componentes then
    v_cambios := concat_ws('; ', v_cambios, 'componentes: ' || array_to_string(new.componentes, ', '));
  end if;
  if tg_op = 'UPDATE' and new.max_depositos is distinct from old.max_depositos then
    v_cambios := concat_ws('; ', v_cambios, 'depósitos: hasta ' || old.max_depositos || ' → hasta ' || new.max_depositos);
  end if;
  insert into public.audit_log (tabla, registro_id, descripcion, accion, usuario_nombre, datos_anteriores, datos_nuevos)
  values ('licencia', '1', 'Plan · ' || coalesce(v_cambios, 'sin cambios'), lower(tg_op), 'Plataforma',
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$function$;

select public._funciones_a_la_app();
