-- Parte "base" de supabase/migrations/20260101000000_esquema_base.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Esquema base de la plantilla (sin datos de ninguna empresa).
-- Generado a partir de una instalación real y verificado contra ella.
-- Las mejoras propias de la plantilla van en las migraciones siguientes.
set check_function_bodies = off;
set search_path = public;

-- ======================================================================
-- Extensiones
-- ======================================================================

create extension if not exists pg_trgm with schema public;

create extension if not exists pgcrypto with schema extensions;

create extension if not exists "uuid-ossp" with schema extensions;

-- ======================================================================
-- Tablas
-- ======================================================================

create table public."audit_log" (
  "id" bigint generated always as identity not null,
  "tabla" text not null,
  "registro_id" text not null,
  "descripcion" text,
  "accion" text not null,
  "usuario_id" uuid,
  "usuario_nombre" text,
  "usuario_email" text,
  "datos_anteriores" jsonb,
  "datos_nuevos" jsonb,
  "created_at" timestamp with time zone default now() not null
);

create table public."configuracion" (
  "id" integer default 1 not null,
  "empresa_nombre" text default 'Mi Empresa'::text,
  "empresa_direccion" text,
  "empresa_telefono" text,
  "empresa_email" text,
  "rotulo_pie" text,
  "rotulo_campos" jsonb default '{"horario": true, "telefono": true, "direccion": true}'::jsonb,
  "logo_base64" text default ''::text,
  "rotulo_design" jsonb default '{}'::jsonb,
  "comisionistas_campos_custom" jsonb default '[]'::jsonb,
  "rotulo_diseno_id" bigint
);

create table public."error_logs" (
  "id" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "usuario_id" uuid,
  "usuario_email" text,
  "mensaje" text not null,
  "stack" text,
  "pantalla" text,
  "url" text,
  "user_agent" text
);

create table public."sugerencias" (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid,
  "mensaje" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."task_history" (
  "id" uuid default gen_random_uuid() not null,
  "task_id" uuid not null,
  "user_id" uuid not null,
  "action" text not null,
  "note" text default ''::text,
  "created_at" timestamp with time zone default now() not null
);

create table public."tasks" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "title" text not null,
  "description" text default ''::text,
  "status" text default 'pending'::text not null,
  "traffic_level" text default 'green'::text not null,
  "start_date" date default CURRENT_DATE not null,
  "assigned_date" date default CURRENT_DATE not null,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "pending_days" integer default 0 not null,
  "carry_count" integer default 0 not null,
  "is_stagnant" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

create table public."usuarios_perfil" (
  "id" uuid not null,
  "nombre" text,
  "apellido" text,
  "email" text,
  "rol" text default 'user'::text,
  "activo" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "last_login_at" timestamp with time zone,
  "access_status" text default 'active'::text not null,
  "access_expires_at" timestamp with time zone,
  "mantenimiento_rol" text,
  "puede_ver_retiros" boolean default false not null,
  "puede_ver_errores" boolean default false not null,
  "puede_resetear_contrasenas" boolean default false not null,
  "puede_ver_sugerencias" boolean default false not null,
  "es_owner" boolean default false not null
);

-- ======================================================================
-- Restricciones (claves, únicos, chequeos y relaciones)
-- ======================================================================

alter table only public."audit_log" add constraint "audit_log_pkey" PRIMARY KEY (id);

alter table only public."configuracion" add constraint "configuracion_pkey" PRIMARY KEY (id);

alter table only public."error_logs" add constraint "error_logs_pkey" PRIMARY KEY (id);

alter table only public."sugerencias" add constraint "sugerencias_pkey" PRIMARY KEY (id);

alter table only public."task_history" add constraint "task_history_pkey" PRIMARY KEY (id);

alter table only public."tasks" add constraint "tasks_pkey" PRIMARY KEY (id);

alter table only public."usuarios_perfil" add constraint "usuarios_perfil_pkey" PRIMARY KEY (id);

alter table only public."audit_log" add constraint "audit_log_accion_check" CHECK ((accion = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text])));

alter table only public."task_history" add constraint "task_history_action_check" CHECK ((action = ANY (ARRAY['created'::text, 'edited'::text, 'completed'::text, 'cancelled'::text, 'carried'::text, 'reprogrammed'::text, 'traffic_changed'::text, 'stagnant_detected'::text])));

alter table only public."task_history" add constraint "task_history_note_check" CHECK ((char_length(note) <= 1000));

alter table only public."tasks" add constraint "tasks_carry_count_check" CHECK ((carry_count >= 0));

alter table only public."tasks" add constraint "tasks_description_check" CHECK ((char_length(description) <= 5000));

alter table only public."tasks" add constraint "tasks_pending_days_check" CHECK ((pending_days >= 0));

alter table only public."tasks" add constraint "tasks_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'cancelled'::text])));

alter table only public."tasks" add constraint "tasks_title_check" CHECK (((char_length(title) > 0) AND (char_length(title) <= 500)));

alter table only public."tasks" add constraint "tasks_traffic_level_check" CHECK ((traffic_level = ANY (ARRAY['green'::text, 'yellow'::text, 'red'::text])));

alter table only public."usuarios_perfil" add constraint "chk_no_sin_acceso_a_ambos" CHECK ((NOT ((rol = 'disabled'::text) AND (mantenimiento_rol IS NULL))));

alter table only public."usuarios_perfil" add constraint "usuarios_perfil_access_status_check" CHECK ((access_status = ANY (ARRAY['active'::text, 'blocked'::text, 'trial'::text, 'expired'::text])));

alter table only public."usuarios_perfil" add constraint "usuarios_perfil_mantenimiento_rol_check" CHECK ((mantenimiento_rol = ANY (ARRAY['comun'::text, 'admin'::text])));

alter table only public."error_logs" add constraint "error_logs_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios_perfil(id);

alter table only public."sugerencias" add constraint "sugerencias_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios_perfil(id);

alter table only public."task_history" add constraint "task_history_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

alter table only public."task_history" add constraint "task_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES usuarios_perfil(id) ON DELETE CASCADE;

alter table only public."tasks" add constraint "tasks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES usuarios_perfil(id) ON DELETE CASCADE;

CREATE INDEX idx_task_history_task_id ON public.task_history USING btree (task_id);

CREATE INDEX idx_tasks_user_assigned ON public.tasks USING btree (user_id, assigned_date);

CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id);

CREATE INDEX idx_tasks_user_status ON public.tasks USING btree (user_id, status);

-- ======================================================================
-- Funciones
-- ======================================================================

CREATE OR REPLACE FUNCTION public._aud_actor(OUT p_nombre text, OUT p_email text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  select nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), ''), email
    into p_nombre, p_email
  from usuarios_perfil where id = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public._aud_cambio(etiqueta text, anterior text, nuevo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when anterior is distinct from nuevo
    then etiqueta || ' ' || coalesce(nullif(left(anterior, 60), ''), '—') || ' → ' || coalesce(nullif(left(nuevo, 60), ''), '—')
  end;
$function$;

CREATE OR REPLACE FUNCTION public.agregar_dueno(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_owner() then
    raise exception 'Solo un dueño puede agregar a otro dueño.';
  end if;
  if not exists (select 1 from usuarios_perfil where id = p_id) then
    raise exception 'Ese usuario no existe.';
  end if;
  if exists (select 1 from usuarios_perfil where id = p_id and activo is not true) then
    raise exception 'No se puede agregar como dueño a un usuario bloqueado.';
  end if;
  update usuarios_perfil set es_owner = true where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.can_view_all_retiros()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_perfil
    WHERE id = auth.uid() AND puede_ver_retiros = true
  ) OR is_owner();
$function$;

CREATE OR REPLACE FUNCTION public.can_view_errores()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_perfil
    WHERE id = auth.uid() AND puede_ver_errores = true
  ) OR is_owner();
$function$;

CREATE OR REPLACE FUNCTION public.can_view_papelera()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_perfil
    WHERE id = auth.uid() AND puede_ver_papelera = true
  ) OR is_owner();
$function$;

CREATE OR REPLACE FUNCTION public.can_view_sugerencias()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from usuarios_perfil
    where id = auth.uid() and puede_ver_sugerencias = true
  ) or is_owner();
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

CREATE OR REPLACE FUNCTION public.complete_task(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_owner UUID;
BEGIN
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

CREATE OR REPLACE FUNCTION public.evitar_borrar_dueno()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.es_owner then
    raise exception 'No se puede eliminar a un dueño del sistema. Quitale primero el cargo de dueño.';
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.evitar_sin_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (select count(*) from usuarios_perfil where es_owner = true) = 0 then
    raise exception 'El sistema debe tener siempre un dueño — asigná uno antes de sacar el actual.';
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil record;
  v_desc text;
begin
  select nombre, apellido, email into v_perfil from usuarios_perfil where id = auth.uid();

  v_desc := case when tg_op = 'DELETE' then old.nombre else new.nombre end;

  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    tg_table_name,
    (case when tg_op = 'DELETE' then old.id else new.id end)::text,
    v_desc,
    lower(tg_op),
    auth.uid(),
    nullif(trim(coalesce(v_perfil.nombre,'') || ' ' || coalesce(v_perfil.apellido,'')), ''),
    v_perfil.email,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$function$;

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
    AND (target_user_id = auth.uid() OR public.is_admin(auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.usuarios_perfil (id, nombre, apellido, email, rol, activo, access_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    '',
    COALESCE(NEW.email, ''),
    'user',
    true,
    'trial'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_active_access(user_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios_perfil
    WHERE id = user_uuid
    AND access_status IN ('active', 'trial')
    AND (access_expires_at IS NULL OR access_expires_at > now())
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from usuarios_perfil
    where id = user_uuid and rol = 'admin'
  ) or is_owner();
$function$;

CREATE OR REPLACE FUNCTION public.is_directorio_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_perfil
    WHERE id = auth.uid() AND rol = 'admin'
  ) OR is_owner();
$function$;

CREATE OR REPLACE FUNCTION public.is_mantenimiento_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_perfil
    WHERE id = auth.uid() AND mantenimiento_rol = 'admin'
  ) OR is_owner();
$function$;

CREATE OR REPLACE FUNCTION public.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select es_owner from usuarios_perfil where id = auth.uid()), false);
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
        new.puede_resetear_contrasenas, new.puede_ver_sugerencias, new.activo, new.es_owner,
        new.access_status, new.access_expires_at, new.email)
       is distinct from
       (old.rol, old.mantenimiento_rol, old.puede_ver_retiros, old.puede_ver_errores,
        old.puede_resetear_contrasenas, old.puede_ver_sugerencias, old.activo, old.es_owner,
        old.access_status, old.access_expires_at, old.email) then
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

CREATE OR REPLACE FUNCTION public.quitar_dueno(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_owner() then
    raise exception 'Solo un dueño puede quitarle el cargo a otro dueño.';
  end if;
  if (select count(*) from usuarios_perfil where es_owner) <= 1 then
    raise exception 'El sistema debe tener siempre al menos un dueño.';
  end if;
  update usuarios_perfil set es_owner = false where id = p_id and es_owner;
end;
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

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tiene_acceso_mantenimiento()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from usuarios_perfil
    where id = auth.uid() and mantenimiento_rol is not null
  ) or is_mantenimiento_admin();
$function$;

CREATE OR REPLACE FUNCTION public.transferir_ownership(p_nuevo_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_owner() then
    raise exception 'Solo el dueño actual puede transferir este rol';
  end if;
  if p_nuevo_owner_id = auth.uid() then
    raise exception 'Ya sos el dueño';
  end if;
  update usuarios_perfil set es_owner = true where id = p_nuevo_owner_id;
  update usuarios_perfil set es_owner = false where id = auth.uid();
end;
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

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- ======================================================================
-- Disparadores
-- ======================================================================

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TRIGGER set_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_usuarios_perfil_updated_at BEFORE UPDATE ON public.usuarios_perfil FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_audit_usuarios_delete AFTER DELETE ON public.usuarios_perfil FOR EACH ROW EXECUTE FUNCTION fn_audit_log_usuarios();

CREATE TRIGGER trg_audit_usuarios_insert AFTER INSERT ON public.usuarios_perfil FOR EACH ROW EXECUTE FUNCTION fn_audit_log_usuarios();

CREATE TRIGGER trg_audit_usuarios_update AFTER UPDATE OF nombre, apellido, rol, mantenimiento_rol, puede_ver_retiros, puede_ver_errores, puede_resetear_contrasenas, puede_ver_sugerencias, activo, es_owner ON public.usuarios_perfil FOR EACH ROW WHEN (((((((((((old.nombre IS DISTINCT FROM new.nombre) OR (old.apellido IS DISTINCT FROM new.apellido)) OR (old.rol IS DISTINCT FROM new.rol)) OR (old.mantenimiento_rol IS DISTINCT FROM new.mantenimiento_rol)) OR (old.puede_ver_retiros IS DISTINCT FROM new.puede_ver_retiros)) OR (old.puede_ver_errores IS DISTINCT FROM new.puede_ver_errores)) OR (old.puede_resetear_contrasenas IS DISTINCT FROM new.puede_resetear_contrasenas)) OR (old.puede_ver_sugerencias IS DISTINCT FROM new.puede_ver_sugerencias)) OR (old.activo IS DISTINCT FROM new.activo)) OR (old.es_owner IS DISTINCT FROM new.es_owner))) EXECUTE FUNCTION fn_audit_log_usuarios();

CREATE TRIGGER trg_evitar_borrar_dueno BEFORE DELETE ON public.usuarios_perfil FOR EACH ROW EXECUTE FUNCTION evitar_borrar_dueno();

CREATE CONSTRAINT TRIGGER trg_evitar_sin_owner AFTER UPDATE OF es_owner ON public.usuarios_perfil DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION evitar_sin_owner();

CREATE TRIGGER trg_proteger_campos_privilegiados BEFORE UPDATE ON public.usuarios_perfil FOR EACH ROW EXECUTE FUNCTION proteger_campos_privilegiados();

-- ======================================================================
-- Seguridad a nivel de fila (RLS)
-- ======================================================================

alter table public."audit_log" enable row level security;

alter table public."configuracion" enable row level security;

alter table public."error_logs" enable row level security;

alter table public."sugerencias" enable row level security;

alter table public."task_history" enable row level security;

alter table public."tasks" enable row level security;

alter table public."usuarios_perfil" enable row level security;

-- ======================================================================
-- Políticas de acceso
-- ======================================================================

create policy "audit_log_select_owner" on public."audit_log"
  as permissive for select to authenticated
  using (is_owner());

create policy "configuracion_select" on public."configuracion"
  as permissive for select to authenticated
  using (true);

create policy "configuracion_select_anon" on public."configuracion"
  as permissive for select to anon
  using (true);

create policy "configuracion_write_admin" on public."configuracion"
  as permissive for all to authenticated
  using (is_directorio_admin())
  with check (is_directorio_admin());

create policy "error_logs_delete" on public."error_logs"
  as permissive for delete to authenticated
  using (can_view_errores());

create policy "error_logs_insert" on public."error_logs"
  as permissive for insert to authenticated
  with check ((usuario_id = auth.uid()));

create policy "error_logs_select" on public."error_logs"
  as permissive for select to authenticated
  using (can_view_errores());

create policy "sugerencias_delete" on public."sugerencias"
  as permissive for delete to public
  using (can_view_sugerencias());

create policy "sugerencias_insert" on public."sugerencias"
  as permissive for insert to public
  with check ((usuario_id = auth.uid()));

create policy "sugerencias_select" on public."sugerencias"
  as permissive for select to public
  using (can_view_sugerencias());

create policy "task_history_insert_own" on public."task_history"
  as permissive for insert to public
  with check (((user_id = auth.uid()) AND has_active_access(auth.uid())));

create policy "task_history_select_admin" on public."task_history"
  as permissive for select to public
  using (is_admin(auth.uid()));

create policy "task_history_select_own" on public."task_history"
  as permissive for select to public
  using (((user_id = auth.uid()) AND has_active_access(auth.uid())));

create policy "tasks_insert_own" on public."tasks"
  as permissive for insert to public
  with check (((user_id = auth.uid()) AND has_active_access(auth.uid())));

create policy "tasks_select_admin" on public."tasks"
  as permissive for select to public
  using (is_admin(auth.uid()));

create policy "tasks_select_own" on public."tasks"
  as permissive for select to public
  using (((user_id = auth.uid()) AND has_active_access(auth.uid())));

create policy "tasks_update_own" on public."tasks"
  as permissive for update to public
  using (((user_id = auth.uid()) AND has_active_access(auth.uid())))
  with check ((user_id = auth.uid()));

create policy "usuarios_perfil_select" on public."usuarios_perfil"
  as permissive for select to authenticated
  using (true);

create policy "usuarios_perfil_update" on public."usuarios_perfil"
  as permissive for update to authenticated
  using (((auth.uid() = id) OR is_owner()))
  with check (((auth.uid() = id) OR is_owner()));

-- ======================================================================
-- Permisos de ejecución de funciones
-- ======================================================================

revoke execute on function public."can_view_all_retiros"() from public, anon;

revoke execute on function public."can_view_errores"() from public, anon;

revoke execute on function public."can_view_papelera"() from public, anon;

revoke execute on function public."can_view_sugerencias"() from public, anon;

revoke execute on function public."cancel_task"(p_task_id uuid) from public, anon;

revoke execute on function public."complete_task"(p_task_id uuid) from public, anon;

revoke execute on function public."create_task"(p_title text, p_description text, p_traffic_level text, p_assigned_date date) from public, anon;

revoke execute on function public."get_user_task_counts"(target_user_id uuid) from public, anon;

revoke execute on function public."has_active_access"(user_uuid uuid) from public, anon;

revoke execute on function public."is_admin"(user_uuid uuid) from public, anon;

revoke execute on function public."is_directorio_admin"() from public, anon;

revoke execute on function public."is_mantenimiento_admin"() from public, anon;

revoke execute on function public."is_owner"() from public, anon;

revoke execute on function public."process_pending_tasks_for_user"(target_user_id uuid) from public, anon;

revoke execute on function public."reprogram_task"(p_task_id uuid, p_new_assigned_date date) from public, anon;

revoke execute on function public."tiene_acceso_mantenimiento"() from public, anon;

revoke execute on function public."transferir_ownership"(p_nuevo_owner_id uuid) from public, anon;

revoke execute on function public."update_task"(p_task_id uuid, p_title text, p_description text, p_traffic_level text) from public, anon;

-- ======================================================================
-- Datos mínimos de arranque
-- ======================================================================

-- La app lee siempre la fila 1 de configuración (nombre, logo, diseño del rótulo).
insert into public.configuracion (id) values (1) on conflict (id) do nothing;
