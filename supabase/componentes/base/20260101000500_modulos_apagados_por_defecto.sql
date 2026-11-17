-- Parte "base" de supabase/migrations/20260101000500_modulos_apagados_por_defecto.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Un módulo nuevo nace APAGADO para todos los clientes.
--
-- Hasta ahora, un módulo que no figuraba en la licencia contaba como activo. Para algo que se vende es al
-- revés: si se agrega un módulo nuevo al sistema, ningún cliente lo recibe hasta que se le active de forma
-- expresa con "pnpm cliente modulos". Las licencias que ya existen listan los cinco módulos actuales de
-- forma explícita, así que esta migración no cambia nada de lo que hoy está prendido.

create or replace function public.modulo_activo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select modulos ->> p_modulo from public.licencia where id = 1) = 'true', false);
$$;

-- El historial de la licencia usa la misma regla: lo que no figura cuenta como apagado.
create or replace function public.fn_audit_log_licencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb := case when tg_op = 'UPDATE' then old.modulos else '{}'::jsonb end;
  v_cambios text;
begin
  if tg_op = 'UPDATE' and new.modulos is not distinct from v_antes then
    return new;
  end if;
  select string_agg(k || ': ' || case when coalesce(new.modulos ->> k, 'false') = 'true' then 'activo' else 'apagado' end, '; ' order by k)
    into v_cambios
  from (select key as k from jsonb_each(new.modulos) union select key from jsonb_each(v_antes)) claves
  where coalesce(v_antes ->> k, 'false') is distinct from coalesce(new.modulos ->> k, 'false') or tg_op = 'INSERT';
  insert into public.audit_log (tabla, registro_id, descripcion, accion, usuario_nombre, datos_anteriores, datos_nuevos)
  values ('licencia', '1', 'Módulos · ' || coalesce(v_cambios, 'sin cambios'), lower(tg_op), 'Administración del sistema',
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
