-- Parte "base" de supabase/migrations/20260101000300_licencia_y_bloqueo_de_modulos.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Licencia de módulos y bloqueo en la base de datos.
--
-- Qué módulos usa cada instalación lo define SOLO quien vende (con la clave de servicio, por el comando
-- "pnpm cliente modulos"): vive en la tabla "licencia", que ningún usuario puede escribir. Un módulo
-- apagado queda bloqueado para todos, incluido el dueño: sus tablas, sus funciones y sus archivos.
--
-- Dependencias entre módulos:
--   envios      necesita proveedores (cada envío es de un proveedor).
--   deposito    funciona solo; sus "Reparaciones" y "Proveedores por repuesto" necesitan además proveedores.
--   comisionistas, tareas: independientes.

set check_function_bodies = off;

-- 1) La licencia (una sola fila). Se copia lo que hubiera en configuracion.modulos.
create table public.licencia (
  id integer primary key default 1 check (id = 1),
  modulos jsonb not null
    default '{"proveedores": true, "comisionistas": true, "envios": true, "tareas": true, "deposito": true}'::jsonb
    check (jsonb_typeof(modulos) = 'object'),
  actualizada_at timestamptz not null default now()
);

alter table public.licencia enable row level security;

create policy licencia_select on public.licencia for select to authenticated using (true);

-- Sin políticas de escritura: solo la clave de servicio puede cambiarla.

insert into public.licencia (id, modulos)
select 1, coalesce((select modulos from public.configuracion where id = 1),
  '{"proveedores": true, "comisionistas": true, "envios": true, "tareas": true, "deposito": true}'::jsonb);

alter table public.configuracion drop constraint if exists configuracion_modulos_check;

alter table public.configuracion drop column if exists modulos;

-- 2) Consultas de la licencia. Un módulo sin dato cuenta como activo.
create or replace function public.modulo_activo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select modulos ->> p_modulo from public.licencia where id = 1) <> 'false', true);
$$;

create or replace function public.exigir_modulo(variadic p_modulos text[])
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m text;
begin
  foreach m in array p_modulos loop
    if not public.modulo_activo(m) then
      raise exception 'El módulo "%" no está activo en esta instalación.', m;
    end if;
  end loop;
end;
$$;

-- 3) Cada cambio de la licencia queda en el historial (lo hace la clave de servicio, sin usuario).
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
  select string_agg(k || ': ' || case when coalesce(new.modulos ->> k, 'true') = 'false' then 'apagado' else 'activo' end, '; ' order by k)
    into v_cambios
  from (select key as k from jsonb_each(new.modulos) union select key from jsonb_each(v_antes)) claves
  where coalesce(v_antes ->> k, 'true') is distinct from coalesce(new.modulos ->> k, 'true') or tg_op = 'INSERT';
  insert into public.audit_log (tabla, registro_id, descripcion, accion, usuario_nombre, datos_anteriores, datos_nuevos)
  values ('licencia', '1', 'Módulos · ' || coalesce(v_cambios, 'sin cambios'), lower(tg_op), 'Administración del sistema',
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;

create trigger trg_audit_licencia after insert or update on public.licencia
  for each row execute function public.fn_audit_log_licencia();

create or replace function public.licencia_actualizada()
returns trigger language plpgsql as $$
begin
  new.actualizada_at := now();
  return new;
end;
$$;

create trigger trg_licencia_fecha before update on public.licencia
  for each row execute function public.licencia_actualizada();

-- Módulo tareas
create policy bloqueo_modulo on public.tasks as restrictive for all to public
  using (public.modulo_activo('tareas')) with check (public.modulo_activo('tareas'));

create policy bloqueo_modulo on public.task_history as restrictive for all to public
  using (public.modulo_activo('tareas')) with check (public.modulo_activo('tareas'));

CREATE OR REPLACE FUNCTION public.create_task(p_title text, p_description text DEFAULT ''::text, p_traffic_level text DEFAULT 'green'::text, p_assigned_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_task_id UUID;
  final_assigned_date DATE;
BEGIN
  PERFORM public.exigir_modulo('tareas');
  IF NOT public.has_active_access(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso deshabilitado';
  END IF;

  IF p_title IS NULL OR char_length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'El título no puede estar vacío';
  END IF;

  IF p_traffic_level NOT IN ('green', 'yellow', 'red') THEN
    RAISE EXCEPTION 'Nivel de semáforo inválido: %', p_traffic_level;
  END IF;

  IF p_assigned_date IS NOT NULL AND p_assigned_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha asignada no puede ser anterior a hoy';
  END IF;

  final_assigned_date := COALESCE(p_assigned_date, CURRENT_DATE);

  INSERT INTO public.tasks (
    user_id, title, description, status, traffic_level,
    start_date, assigned_date, pending_days, carry_count, is_stagnant
  )
  VALUES (
    auth.uid(), trim(p_title), COALESCE(p_description, ''), 'pending', p_traffic_level,
    CURRENT_DATE, final_assigned_date, 0, 0, false
  )
  RETURNING id INTO new_task_id;

  INSERT INTO public.task_history (task_id, user_id, action, note)
  VALUES (new_task_id, auth.uid(), 'created', 'Tarea creada');

  RETURN new_task_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_task(p_task_id uuid, p_title text, p_description text, p_traffic_level text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  task_row record;
begin
  PERFORM public.exigir_modulo('tareas');
  if p_title is null or trim(p_title) = '' then
    raise exception 'El título no puede estar vacío';
  end if;
  if p_traffic_level not in ('green', 'yellow', 'red') then
    raise exception 'Nivel de semáforo inválido';
  end if;

  select id, user_id into task_row
  from public.tasks
  where id = p_task_id and status = 'pending';

  if task_row.id is null then
    raise exception 'Tarea no encontrada o no está pendiente';
  end if;

  if task_row.user_id != auth.uid() then
    raise exception 'No autorizado';
  end if;

  if not public.has_active_access(auth.uid()) then
    raise exception 'Acceso deshabilitado';
  end if;

  update public.tasks
  set title = trim(p_title), description = p_description, traffic_level = p_traffic_level
  where id = p_task_id;

  insert into public.task_history (task_id, user_id, action, note)
  values (p_task_id, auth.uid(), 'edited', 'Tarea editada');
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_task(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_owner UUID;
BEGIN
  PERFORM public.exigir_modulo('tareas');
  SELECT user_id INTO task_owner
  FROM public.tasks
  WHERE id = p_task_id AND status = 'pending';

  IF task_owner IS NULL THEN
    RAISE EXCEPTION 'Tarea no encontrada o no está pendiente';
  END IF;

  IF task_owner != auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.has_active_access(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso deshabilitado';
  END IF;

  UPDATE public.tasks
  SET
    status = 'completed',
    completed_at = now(),
    cancelled_at = NULL
  WHERE id = p_task_id;

  INSERT INTO public.task_history (task_id, user_id, action, note)
  VALUES (p_task_id, auth.uid(), 'completed', 'Tarea completada');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_task(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_owner UUID;
BEGIN
  PERFORM public.exigir_modulo('tareas');
  SELECT user_id INTO task_owner
  FROM public.tasks
  WHERE id = p_task_id AND status = 'pending';

  IF task_owner IS NULL THEN
    RAISE EXCEPTION 'Tarea no encontrada o no está pendiente';
  END IF;

  IF task_owner != auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.has_active_access(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso deshabilitado';
  END IF;

  UPDATE public.tasks
  SET
    status = 'cancelled',
    cancelled_at = now(),
    completed_at = NULL
  WHERE id = p_task_id;

  INSERT INTO public.task_history (task_id, user_id, action, note)
  VALUES (p_task_id, auth.uid(), 'cancelled', 'Tarea cancelada');
END;
$function$;

CREATE OR REPLACE FUNCTION public.reprogram_task(p_task_id uuid, p_new_assigned_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_row RECORD;
  new_pending_days INTEGER;
  new_traffic TEXT;
  old_traffic TEXT;
  new_stagnant BOOLEAN;
BEGIN
  PERFORM public.exigir_modulo('tareas');
  IF p_new_assigned_date IS NULL THEN
    RAISE EXCEPTION 'La fecha asignada no puede ser null';
  END IF;

  IF p_new_assigned_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha asignada no puede ser anterior a hoy';
  END IF;

  SELECT id, user_id, start_date, traffic_level, carry_count, is_stagnant
  INTO task_row
  FROM public.tasks
  WHERE id = p_task_id AND status = 'pending';

  IF task_row.id IS NULL THEN
    RAISE EXCEPTION 'Tarea no encontrada o no está pendiente';
  END IF;

  IF task_row.user_id != auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.has_active_access(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso deshabilitado';
  END IF;

  old_traffic := task_row.traffic_level;
  new_pending_days := CURRENT_DATE - task_row.start_date;

  IF new_pending_days <= 1 THEN
    new_traffic := 'green';
  ELSIF new_pending_days <= 3 THEN
    new_traffic := 'yellow';
  ELSE
    new_traffic := 'red';
  END IF;

  new_stagnant := (
    new_pending_days >= 5
    OR task_row.carry_count >= 3
    OR new_traffic = 'red'
  );

  UPDATE public.tasks
  SET
    assigned_date = p_new_assigned_date,
    pending_days = new_pending_days,
    traffic_level = new_traffic,
    is_stagnant = new_stagnant
  WHERE id = p_task_id;

  INSERT INTO public.task_history (task_id, user_id, action, note)
  VALUES (
    p_task_id,
    auth.uid(),
    'reprogrammed',
    'Reprogramada al ' || p_new_assigned_date::TEXT || '. Días pendiente: ' || new_pending_days
  );

  IF new_traffic != old_traffic THEN
    INSERT INTO public.task_history (task_id, user_id, action, note)
    VALUES (
      p_task_id,
      auth.uid(),
      'traffic_changed',
      'Semáforo cambió de ' || old_traffic || ' a ' || new_traffic
    );
  END IF;

  IF new_stagnant AND NOT task_row.is_stagnant THEN
    INSERT INTO public.task_history (task_id, user_id, action, note)
    VALUES (
      p_task_id,
      auth.uid(),
      'stagnant_detected',
      'Tarea marcada como estancada. Días: ' || new_pending_days || ', arrastres: ' || task_row.carry_count || ', semáforo: ' || new_traffic
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_pending_tasks_for_user(target_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_row RECORD;
  new_pending_days INTEGER;
  new_traffic TEXT;
  old_traffic TEXT;
  new_carry INTEGER;
  new_stagnant BOOLEAN;
  processed_count INTEGER := 0;
BEGIN
  PERFORM public.exigir_modulo('tareas');
  IF target_user_id != auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF NOT public.has_active_access(target_user_id) THEN
    RAISE EXCEPTION 'Acceso deshabilitado';
  END IF;

  FOR task_row IN
    SELECT id, start_date, traffic_level, carry_count, is_stagnant
    FROM public.tasks
    WHERE user_id = target_user_id
      AND status = 'pending'
      AND assigned_date < CURRENT_DATE
  LOOP
    old_traffic := task_row.traffic_level;
    new_pending_days := CURRENT_DATE - task_row.start_date;
    new_carry := task_row.carry_count + 1;

    IF new_pending_days <= 1 THEN
      new_traffic := 'green';
    ELSIF new_pending_days <= 3 THEN
      new_traffic := 'yellow';
    ELSE
      new_traffic := 'red';
    END IF;

    new_stagnant := (
      new_pending_days >= 5
      OR new_carry >= 3
      OR new_traffic = 'red'
    );

    UPDATE public.tasks
    SET
      assigned_date = CURRENT_DATE,
      pending_days = new_pending_days,
      carry_count = new_carry,
      traffic_level = new_traffic,
      is_stagnant = new_stagnant
    WHERE id = task_row.id;

    INSERT INTO public.task_history (task_id, user_id, action, note)
    VALUES (
      task_row.id,
      target_user_id,
      'carried',
      'Arrastrada al ' || CURRENT_DATE::TEXT || '. Días pendiente: ' || new_pending_days || '. Arrastres: ' || new_carry
    );

    IF new_traffic != old_traffic THEN
      INSERT INTO public.task_history (task_id, user_id, action, note)
      VALUES (
        task_row.id,
        target_user_id,
        'traffic_changed',
        'Semáforo cambió de ' || old_traffic || ' a ' || new_traffic
      );
    END IF;

    IF new_stagnant AND NOT task_row.is_stagnant THEN
      INSERT INTO public.task_history (task_id, user_id, action, note)
      VALUES (
        task_row.id,
        target_user_id,
        'stagnant_detected',
        'Tarea marcada como estancada. Días: ' || new_pending_days || ', arrastres: ' || new_carry || ', semáforo: ' || new_traffic
      );
    END IF;

    processed_count := processed_count + 1;
  END LOOP;

  RETURN processed_count;
END;
$function$;

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
    AND public.modulo_activo('tareas')
    AND (target_user_id = auth.uid() OR public.is_admin(auth.uid()));
$function$;
