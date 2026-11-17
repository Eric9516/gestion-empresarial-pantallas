-- La plataforma: quien administra las empresas del servidor (dar de alta una empresa con su dueño, su licencia, activarla o desactivarla).
-- Vive en su propio esquema, "plataforma", que solo existe en el servidor (Supabase no lo tiene: allá cada cliente tenía su proyecto).
-- Estas funciones ven todas las empresas a propósito (son de postgres): cada una exige primero que quien la usa administre la plataforma.
-- Se puede aplicar de nuevo sin romper nada (lo hace db/actualizar.sh en cada publicación).

create schema if not exists plataforma;
revoke all on schema plataforma from public;
grant usage on schema plataforma to authenticated;

create table if not exists plataforma.administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  desde timestamptz not null default now()
);
revoke all on plataforma.administradores from public, anon, authenticated;

-- La "empresa" de las cuentas de administración: no es de ningún cliente, no tiene módulos y no aparece en el panel. Así quien administra
-- la plataforma entra con su propia cuenta, aparte de las empresas (que tienen sus propios dueños).
create table if not exists plataforma.empresa_interna (
  id uuid primary key references public.empresas (id),
  una boolean not null default true unique check (una)
);
revoke all on plataforma.empresa_interna from public, anon, authenticated;

create or replace function plataforma.es_administrador() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from plataforma.administradores where usuario_id = auth.uid())
$$;

-- La cuenta es de administración (vive en la empresa interna, no en una empresa de clientes): Mi perfil la muestra así.
create or replace function plataforma.es_cuenta_de_plataforma() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios_perfil p join plataforma.empresa_interna i on i.id = p.empresa_id where p.id = auth.uid())
$$;

create or replace function plataforma._exigir() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not plataforma.es_administrador() then raise exception 'No autorizado — solo quien administra la plataforma'; end if;
end $$;

-- Desde acá, lo que se registre (historial, depósito, perfil) es de esa empresa. Quien lo pide es de otra, así que no cuenta como su
-- usuario: la regla de cada tabla usa la empresa pedida (app.empresa) y el historial lo anota como "la plataforma".
create or replace function plataforma._trabajar_para(p_empresa uuid) returns void
language sql security definer set search_path = '' as $$
  select set_config('app.empresa', p_empresa::text, true), set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true)
$$;

create or replace function plataforma._validar_licencia(p_modulos jsonb, p_componentes text[], p_max_depositos integer) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_modulos is null or jsonb_typeof(p_modulos) <> 'object'
     or exists (select 1 from jsonb_each(p_modulos) m where m.key not in ('proveedores', 'comisionistas', 'envios', 'deposito', 'mantenimiento', 'tareas')
                                                          or jsonb_typeof(m.value) <> 'boolean') then
    raise exception 'Los módulos no son válidos';
  end if;
  if p_componentes is null or not ('base' = any (p_componentes))
     or exists (select 1 from unnest(p_componentes) c where c not in ('base', 'abastecimiento', 'mantenimiento')) then
    raise exception 'Los componentes no son válidos';
  end if;
  if p_max_depositos is null or p_max_depositos not between 1 and 100 then raise exception 'Entre 1 y 100 depósitos'; end if;
end $$;

-- Las empresas, con lo principal de cada una
create or replace function plataforma.empresas()
returns table (id uuid, nombre text, activa boolean, creada_at timestamptz, usuarios bigint, duenos text, modulos jsonb, componentes text[],
               max_depositos integer, ultimo_uso timestamptz, mia boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform plataforma._exigir();
  return query
  select e.id, e.nombre, e.activa, e.creada_at,
         (select count(*) from public.usuarios_perfil p where p.empresa_id = e.id),
         (select string_agg(p.email, ', ' order by p.created_at) from public.usuarios_perfil p where p.empresa_id = e.id and p.es_owner),
         l.modulos, l.componentes, l.max_depositos,
         (select max(s.usada) from servidor.sesiones s join public.usuarios_perfil p on p.id = s.usuario_id where p.empresa_id = e.id),
         e.id = (select p.empresa_id from public.usuarios_perfil p where p.id = auth.uid())
  from public.empresas e left join public.licencia l on l.empresa_id = e.id
  where e.id not in (select i.id from plataforma.empresa_interna i)
  order by e.creada_at;
end $$;

-- Los usuarios de una empresa (nombre, correo, si es dueño, si está activo y cuándo usó la app por última vez): los dueños primero.
create or replace function plataforma.usuarios_de(p_empresa uuid)
returns table (id uuid, nombre text, email text, es_owner boolean, activo boolean, ultimo_uso timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform plataforma._exigir();
  return query
  select p.id, nullif(btrim(concat_ws(' ', p.nombre, p.apellido)), ''), p.email, p.es_owner, coalesce(p.activo, false),
         (select max(s.usada) from servidor.sesiones s where s.usuario_id = p.id)
  from public.usuarios_perfil p
  where p.empresa_id = p_empresa
  order by p.es_owner desc, lower(coalesce(nullif(btrim(p.nombre), ''), p.email));
end $$;

-- Alta de una empresa con todo lo que necesita para entrar a trabajar: configuración, licencia, preferencias, su depósito principal (si
-- tiene el componente) y su dueño (la contraseña llega ya cifrada; se la pasa quien la crea). Si algo falla, no queda nada.
create or replace function plataforma.crear_empresa(p_nombre text, p_dueno_nombre text, p_email text, p_hash text,
                                                    p_modulos jsonb, p_componentes text[], p_max_depositos integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid := gen_random_uuid();
  v_usuario uuid := gen_random_uuid();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform plataforma._exigir();
  if coalesce(btrim(p_nombre), '') = '' or char_length(btrim(p_nombre)) > 120 then raise exception 'Falta el nombre de la empresa'; end if;
  if coalesce(btrim(p_dueno_nombre), '') = '' then raise exception 'Falta el nombre del dueño'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  if coalesce(p_hash, '') !~ '^\$2[aby]\$' then raise exception 'La contraseña no es válida'; end if;
  perform plataforma._validar_licencia(p_modulos, p_componentes, p_max_depositos);
  if exists (select 1 from auth.users where lower(email) = v_email and deleted_at is null) then
    raise exception 'Ya hay una cuenta con ese correo';
  end if;

  perform plataforma._trabajar_para(v_empresa);
  insert into public.empresas (id, nombre) values (v_empresa, btrim(p_nombre));
  insert into public.configuracion (empresa_id, empresa_nombre) values (v_empresa, btrim(p_nombre));
  insert into public.licencia (empresa_id, modulos, componentes, max_depositos) values (v_empresa, p_modulos, p_componentes, p_max_depositos);
  insert into public.preferencias_modulos (empresa_id) values (v_empresa);
  if to_regclass('public.depositos') is not null then
    -- el primero arranca con retiros y reparaciones (como trabajaba el Depósito hasta ahora); el dueño o Compras los apagan si no los usan
    execute $q$insert into public.depositos (empresa_id, codigo, nombre, prefijo, es_principal, usa_retiros, usa_reparaciones)
               values ($1, '01', 'Depósito principal', 'M', true, true, true)$q$
      using v_empresa;
  end if;
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (v_usuario, v_email, p_hash, now(), jsonb_build_object('empresa_id', v_empresa));
  update public.usuarios_perfil
     set nombre = btrim(p_dueno_nombre), es_owner = true, rol = 'admin', mantenimiento_rol = 'admin', activo = true
   where id = v_usuario;
  return v_empresa;
end $$;

create or replace function plataforma.cambiar_licencia(p_empresa uuid, p_modulos jsonb, p_componentes text[], p_max_depositos integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform plataforma._exigir();
  perform plataforma._validar_licencia(p_modulos, p_componentes, p_max_depositos);
  perform plataforma._trabajar_para(p_empresa);
  update public.licencia set modulos = p_modulos, componentes = p_componentes, max_depositos = p_max_depositos where empresa_id = p_empresa;
  if not found then raise exception 'No se encontró la empresa'; end if;
end $$;

-- Desactivar una empresa la deja sin entrar (sus sesiones se cierran); sus datos quedan. La propia no: se quedaría afuera quien administra.
create or replace function plataforma.cambiar_estado(p_empresa uuid, p_activa boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform plataforma._exigir();
  if p_empresa = (select empresa_id from public.usuarios_perfil where id = auth.uid()) and not p_activa then
    raise exception 'No podés desactivar tu propia empresa';
  end if;
  update public.empresas set activa = p_activa where id = p_empresa;
  if not found then raise exception 'No se encontró la empresa'; end if;
  if not p_activa then
    delete from servidor.sesiones s using public.usuarios_perfil p where p.id = s.usuario_id and p.empresa_id = p_empresa;
  end if;
end $$;

-- Una cuenta de administración de la plataforma (en la empresa interna, que se crea la primera vez). La usa solo quien maneja el servidor
-- (web/db/administrador.sh, como postgres): desde la app no se puede.
create or replace function plataforma.crear_administrador(p_email text, p_nombre text, p_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_interna uuid := (select id from plataforma.empresa_interna);
  v_usuario uuid := gen_random_uuid();
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  if coalesce(p_hash, '') !~ '^\$2[aby]\$' then raise exception 'La contraseña no es válida'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email and deleted_at is null) then
    raise exception 'Ya hay una cuenta con ese correo';
  end if;
  if v_interna is null then
    v_interna := gen_random_uuid();
    perform plataforma._trabajar_para(v_interna);
    insert into public.empresas (id, nombre) values (v_interna, 'Administración de la plataforma');
    insert into public.configuracion (empresa_id, empresa_nombre, inicial_cerrada_at) values (v_interna, 'Administración de la plataforma', now());
    insert into public.licencia (empresa_id, modulos, componentes, max_depositos)
      values (v_interna, '{"proveedores": false, "comisionistas": false, "envios": false, "deposito": false, "tareas": false}', array['base'], 1);
    insert into public.preferencias_modulos (empresa_id) values (v_interna);
    insert into plataforma.empresa_interna (id) values (v_interna);
  end if;
  perform plataforma._trabajar_para(v_interna);
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data)
  values (v_usuario, v_email, p_hash, now(), jsonb_build_object('empresa_id', v_interna));
  update public.usuarios_perfil set nombre = btrim(coalesce(p_nombre, '')), es_owner = true, rol = 'admin', activo = true where id = v_usuario;
  insert into plataforma.administradores (usuario_id) values (v_usuario);
  return v_usuario;
end $$;

revoke all on all functions in schema plataforma from public, anon;
grant execute on function plataforma.es_administrador(), plataforma.es_cuenta_de_plataforma(), plataforma.empresas(), plataforma.usuarios_de(uuid), plataforma.crear_empresa(text, text, text, text, jsonb, text[], integer),
  plataforma.cambiar_licencia(uuid, jsonb, text[], integer), plataforma.cambiar_estado(uuid, boolean) to authenticated;

-- Con la empresa desactivada no se entra (y las sesiones abiertas dejan de servir).
create or replace function servidor.datos_para_entrar(p_email text)
returns table (id uuid, hash text, activo boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.encrypted_password,
         coalesce(p.activo, false) and (u.banned_until is null or u.banned_until < now())
           and exists (select 1 from public.empresas e where e.id = p.empresa_id and e.activa)
  from auth.users u left join public.usuarios_perfil p on p.id = u.id
  where lower(u.email) = lower(trim(p_email)) and u.deleted_at is null
  limit 1
$$;

create or replace function servidor.usuario_de_sesion(p_huella bytea) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid;
begin
  select s.usuario_id into v_usuario
  from servidor.sesiones s join auth.users u on u.id = s.usuario_id join public.usuarios_perfil p on p.id = s.usuario_id
       join public.empresas e on e.id = p.empresa_id
  where s.huella = p_huella and s.vence > now() and p.activo and e.activa and u.deleted_at is null
    and (u.banned_until is null or u.banned_until < now());
  if v_usuario is not null then
    update servidor.sesiones set usada = now(), vence = now() + servidor._duracion()
    where huella = p_huella and usada < now() - interval '1 day';
  end if;
  return v_usuario;
end $$;
