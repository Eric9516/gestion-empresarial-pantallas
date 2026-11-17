-- Parte "base" de supabase/migrations/20260101000800_zona_horaria_de_la_empresa.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- La fecha "de hoy" de la base sigue la zona horaria de la empresa, no la hora universal (UTC).
--
-- Hallazgo de la prueba exhaustiva: la base calculaba "hoy" en UTC. En Argentina, de 21:00 a 24:00 ya es "mañana"
-- para la base, y crear una tarea fallaba con "La fecha asignada no puede ser anterior a hoy" (lo mismo al
-- reprogramar y al arrastrar tareas atrasadas). Ahora la zona se guarda en la configuración (por defecto Argentina).

create or replace function public.zona_horaria_valida(p text)
returns boolean language sql stable as $$
  select exists (select 1 from pg_timezone_names where name = p);
$$;

alter table public.configuracion
  add column if not exists zona_horaria text not null default 'America/Argentina/Buenos_Aires';

alter table public.configuracion drop constraint if exists configuracion_zona_horaria_valida;

alter table public.configuracion add constraint configuracion_zona_horaria_valida check (public.zona_horaria_valida(zona_horaria));

create or replace function public.hoy_local()
returns date language sql stable security definer set search_path to 'public' as $$
  select (now() at time zone coalesce((select zona_horaria from public.configuracion order by id limit 1), 'America/Argentina/Buenos_Aires'))::date;
$$;

create or replace function public.fecha_local(p timestamptz)
returns date language sql stable security definer set search_path to 'public' as $$
  select (p at time zone coalesce((select zona_horaria from public.configuracion order by id limit 1), 'America/Argentina/Buenos_Aires'))::date;
$$;

revoke execute on function public.zona_horaria_valida(text) from public, anon;

grant execute on function public.zona_horaria_valida(text) to authenticated, service_role;

revoke execute on function public.hoy_local() from public, anon;

revoke execute on function public.fecha_local(timestamptz) from public, anon;

grant execute on function public.hoy_local() to authenticated, service_role;

grant execute on function public.fecha_local(timestamptz) to authenticated, service_role;

alter table public.tasks alter column start_date set default public.hoy_local();

alter table public.tasks alter column assigned_date set default public.hoy_local();

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

  IF p_assigned_date IS NOT NULL AND p_assigned_date < public.hoy_local() THEN
    RAISE EXCEPTION 'La fecha asignada no puede ser anterior a hoy';
  END IF;

  final_assigned_date := COALESCE(p_assigned_date, public.hoy_local());

  INSERT INTO public.tasks (
    user_id, title, description, status, traffic_level,
    start_date, assigned_date, pending_days, carry_count, is_stagnant
  )
  VALUES (
    auth.uid(), trim(p_title), COALESCE(p_description, ''), 'pending', p_traffic_level,
    public.hoy_local(), final_assigned_date, 0, 0, false
  )
  RETURNING id INTO new_task_id;

  INSERT INTO public.task_history (task_id, user_id, action, note)
  VALUES (new_task_id, auth.uid(), 'created', 'Tarea creada');

  RETURN new_task_id;
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

  IF p_new_assigned_date < public.hoy_local() THEN
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
  new_pending_days := public.hoy_local() - task_row.start_date;

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
      AND assigned_date < public.hoy_local()
  LOOP
    old_traffic := task_row.traffic_level;
    new_pending_days := public.hoy_local() - task_row.start_date;
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
      assigned_date = public.hoy_local(),
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
      'Arrastrada al ' || public.hoy_local()::TEXT || '. Días pendiente: ' || new_pending_days || '. Arrastres: ' || new_carry
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
