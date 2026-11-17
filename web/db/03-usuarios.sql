-- Dar de alta, borrar y cambiar la contraseña de un usuario desde Next (Configuración → Usuarios). En Supabase lo hacían tres funciones del
-- servidor de Supabase con la clave secreta; acá son funciones de la base que solo puede usar el rol de Next (app_web), con las mismas reglas.
-- `p_quien` es quien tiene la sesión (lo pone Next, del lado del servidor). La contraseña llega ya cifrada (bcrypt, como la guarda Supabase).
-- Antes de tocar nada se "pone" a quien lo hace como el usuario de la sesión: así los triggers del historial anotan quién fue.

create or replace function servidor._como(p_quien uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p_quien::text, true), set_config('request.jwt.claims', json_build_object('sub', p_quien)::text, true)
$$;

create or replace function servidor._perfil_activo(p_quien uuid) returns public.usuarios_perfil language plpgsql stable security definer set search_path = '' as $$
declare v public.usuarios_perfil;
begin
  select * into v from public.usuarios_perfil where id = p_quien;
  if v.id is null or v.activo is not true then raise exception 'No autorizado — tu cuenta está desactivada'; end if;
  return v;
end $$;

-- Alta: solo un dueño (con eso puede otorgar cualquier permiso). Crea la cuenta y su perfil juntos: si falla uno, no queda nada.
create or replace function servidor.crear_usuario(p_quien uuid, p_email text, p_hash text, p_datos jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_quien public.usuarios_perfil := servidor._perfil_activo(p_quien);
  v_id uuid := gen_random_uuid();
  v_rol text := coalesce(nullif(p_datos ->> 'rol', ''), 'user');
  v_mant text := nullif(p_datos ->> 'mantenimiento_rol', '');
  v_equipos text := nullif(p_datos ->> 'rol_equipos', '');
begin
  if v_quien.es_owner is not true then raise exception 'No autorizado — solo el propietario puede crear usuarios'; end if;
  if coalesce(trim(p_email), '') = '' or coalesce(trim(p_datos ->> 'nombre'), '') = '' then raise exception 'Faltan datos obligatorios'; end if;
  if v_mant is not null and v_mant not in ('comun', 'admin') then raise exception 'Rol de mantenimiento inválido'; end if;
  if v_equipos is not null and v_equipos not in ('admin', 'jefe', 'tecnico', 'consulta') then raise exception 'Rol de Mantenimiento inválido'; end if;
  if v_rol not in ('user', 'admin', 'disabled') then raise exception 'Permiso de Directorio inválido'; end if;
  if v_rol = 'disabled' and v_mant is null and v_equipos is null then raise exception 'No puede quedar sin acceso a ninguna sección'; end if;
  if exists (select 1 from auth.users where lower(email) = lower(trim(p_email)) and deleted_at is null) then
    raise exception 'Ya hay una cuenta con ese correo';
  end if;
  perform servidor._como(p_quien);
  insert into auth.users (id, email, encrypted_password, email_confirmed_at) values (v_id, lower(trim(p_email)), p_hash, now());
  insert into public.usuarios_perfil (id, nombre, apellido, email, rol, mantenimiento_rol, rol_equipos, puede_ver_retiros, puede_ver_errores, puede_resetear_contrasenas,
    puede_ver_sugerencias, puede_ajustar_inventario, puede_gestionar_depositos, puede_ver_auditoria, puede_ver_informe, puede_ver_calendario, activo)
  values (v_id, trim(p_datos ->> 'nombre'), coalesce(trim(p_datos ->> 'apellido'), ''), lower(trim(p_email)), v_rol, v_mant, v_equipos,
    coalesce((p_datos ->> 'puede_ver_retiros')::boolean, false), coalesce((p_datos ->> 'puede_ver_errores')::boolean, false),
    coalesce((p_datos ->> 'puede_resetear_contrasenas')::boolean, false), coalesce((p_datos ->> 'puede_ver_sugerencias')::boolean, false),
    -- solo tiene sentido para administradores del Depósito
    coalesce((p_datos ->> 'puede_ajustar_inventario')::boolean, false) and v_mant = 'admin',
    coalesce((p_datos ->> 'puede_gestionar_depositos')::boolean, false), coalesce((p_datos ->> 'puede_ver_auditoria')::boolean, false),
    coalesce((p_datos ->> 'puede_ver_informe')::boolean, false),
    -- el calendario de Mantenimiento: solo con un rol ahí
    coalesce((p_datos ->> 'puede_ver_calendario')::boolean, false) and v_equipos is not null, true)
  -- (al crear la cuenta, la base ya le hace un perfil vacío y desactivado: se completa, como hacía la función de Supabase)
  on conflict (id) do update set nombre = excluded.nombre, apellido = excluded.apellido, email = excluded.email, rol = excluded.rol,
    mantenimiento_rol = excluded.mantenimiento_rol, rol_equipos = excluded.rol_equipos, puede_ver_retiros = excluded.puede_ver_retiros, puede_ver_errores = excluded.puede_ver_errores,
    puede_resetear_contrasenas = excluded.puede_resetear_contrasenas, puede_ver_sugerencias = excluded.puede_ver_sugerencias,
    puede_ajustar_inventario = excluded.puede_ajustar_inventario, puede_gestionar_depositos = excluded.puede_gestionar_depositos,
    puede_ver_auditoria = excluded.puede_ver_auditoria, puede_ver_informe = excluded.puede_ver_informe, puede_ver_calendario = excluded.puede_ver_calendario, activo = true;
  return v_id;
end $$;

-- Baja definitiva: solo un dueño, nunca a sí mismo ni a otro dueño (primero hay que quitarle el cargo). Se va el perfil y la cuenta.
create or replace function servidor.eliminar_usuario(p_quien uuid, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_quien public.usuarios_perfil := servidor._perfil_activo(p_quien);
begin
  if v_quien.es_owner is not true then raise exception 'No autorizado — solo el propietario puede eliminar usuarios'; end if;
  if p_id = p_quien then raise exception 'No podés eliminar tu propia cuenta'; end if;
  -- (estas funciones ven todas las empresas: la persona tiene que ser de la empresa de quien lo pide)
  if not exists (select 1 from public.usuarios_perfil where id = p_id and empresa_id = v_quien.empresa_id) then
    raise exception 'No se encontró el usuario';
  end if;
  if exists (select 1 from public.usuarios_perfil where id = p_id and es_owner) then
    raise exception 'No se puede eliminar a un dueño del sistema. Quitale primero el cargo de dueño.';
  end if;
  perform servidor._como(p_quien);
  delete from public.usuarios_perfil where id = p_id;
  delete from auth.users where id = p_id;
end $$;

-- Contraseña nueva para otro: un dueño (de cualquiera menos de sí mismo) o quien tiene el permiso, solo de personas sin cargos ni permisos
-- especiales (si no, entraría con una cuenta que tiene más permisos que la suya). Queda en el historial quién la cambió (nunca la contraseña),
-- y se cierran las sesiones abiertas de esa persona.
create or replace function servidor.cambiar_contrasena(p_quien uuid, p_id uuid, p_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_quien public.usuarios_perfil := servidor._perfil_activo(p_quien);
  v_obj public.usuarios_perfil;
begin
  if v_quien.es_owner is not true and v_quien.puede_resetear_contrasenas is not true then
    raise exception 'No autorizado — no tenés permiso para resetear contraseñas';
  end if;
  if p_id = p_quien then raise exception 'No podés resetear tu propia contraseña por acá'; end if;
  -- (estas funciones ven todas las empresas: la persona tiene que ser de la empresa de quien lo pide)
  select * into v_obj from public.usuarios_perfil where id = p_id and empresa_id = v_quien.empresa_id;
  if v_obj.id is null then raise exception 'No se encontró el usuario'; end if;
  if v_quien.es_owner is not true then
    if v_obj.es_owner then raise exception 'No podés resetear la contraseña del propietario'; end if;
    if v_obj.rol = 'admin' or v_obj.mantenimiento_rol = 'admin' or v_obj.puede_ver_retiros or v_obj.puede_ver_errores or v_obj.puede_resetear_contrasenas
       or v_obj.puede_ver_sugerencias or v_obj.puede_ajustar_inventario or v_obj.puede_gestionar_depositos
       or v_obj.puede_ver_informe then
      raise exception 'La contraseña de un administrador o de alguien con permisos especiales la restablece un dueño';
    end if;
  end if;
  update auth.users set encrypted_password = p_hash, updated_at = now() where id = p_id;
  delete from servidor.sesiones where usuario_id = p_id;
  insert into public.audit_log (empresa_id, tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email)
  values (v_quien.empresa_id, 'usuarios_perfil', p_id::text,
    'Contraseña restablecida: ' || coalesce(nullif(trim(concat_ws(' ', v_obj.nombre, v_obj.apellido)), ''), v_obj.email, p_id::text),
    'update', p_quien, nullif(trim(concat_ws(' ', v_quien.nombre, v_quien.apellido)), ''), v_quien.email);
end $$;

-- La contraseña propia (Mi perfil): Next ya comprobó la actual. Las otras sesiones quedan abiertas (como en Supabase): para cerrarlas está
-- "Cerrar sesión en los demás equipos".
create or replace function servidor.cambiar_mi_contrasena(p_quien uuid, p_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform servidor._perfil_activo(p_quien);
  update auth.users set encrypted_password = p_hash, updated_at = now() where id = p_quien;
end $$;

-- Cierra las demás sesiones de quien tiene esta (la de este equipo queda abierta).
create or replace function servidor.cerrar_otras_sesiones(p_huella bytea) returns void
language sql security definer set search_path = '' as $$
  delete from servidor.sesiones where huella <> p_huella and usuario_id = (select usuario_id from servidor.sesiones where huella = p_huella)
$$;

revoke all on function servidor._como(uuid), servidor._perfil_activo(uuid), servidor.crear_usuario(uuid, text, text, jsonb),
  servidor.eliminar_usuario(uuid, uuid), servidor.cambiar_contrasena(uuid, uuid, text),
  servidor.cambiar_mi_contrasena(uuid, text), servidor.cerrar_otras_sesiones(bytea) from public;
