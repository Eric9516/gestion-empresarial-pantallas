-- Varias empresas en una sola base (parte de la Base). Cada dato es de una empresa y nadie ve ni toca lo de otra: lo impone la base.
--
-- 1) La tabla de empresas. La que ya existía (o la primera de una instalación nueva) tiene un id fijo, y todo lo que había pasa a ser suyo.
-- 2) La empresa de la sesión: la del perfil de quien usa la app. Si la base tiene una sola empresa, esa aunque no haya sesión (la pantalla
--    de entrada, los scripts y las instalaciones de una empresa siguen andando igual que antes).
-- 3) Cada tabla lleva su empresa (empresa_id, que se completa sola con la de la sesión) y una regla RESTRICTIVA: solo filas de la empresa
--    de la sesión, para leer y para escribir. Se suma a las reglas de siempre (no las reemplaza) y se fuerza también para el dueño de la tabla.
-- 4) Las funciones "especiales" (security definer) corren como app_funciones, un rol SIN permiso para saltear las reglas: así ninguna puede
--    cruzar empresas aunque se olvide de filtrar, también las que se agreguen después (una prueba falla si alguna queda como postgres).
--    Quedan como postgres solo las que tienen que ver más de una empresa y filtran a mano (la lista de _funciones_a_la_app).
-- 5) La configuración, la licencia y las preferencias de módulos eran "una sola fila": ahora una por empresa (el id sigue siendo 1, así que
--    lo que pide "where id = 1" sigue andando: la regla le deja ver solo la de su empresa).
--
-- Los otros componentes llaman a public._de_empresa() para sus tablas y a public._funciones_a_la_app() al final.

set check_function_bodies = off;

-- 1) Las empresas
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 120),
  activa boolean not null default true,
  creada_at timestamptz not null default now()
);
alter table public.empresas enable row level security;
alter table public.empresas force row level security;
revoke all on public.empresas from public, anon, authenticated;

insert into public.empresas (id, nombre)
values ('00000000-0000-0000-0000-000000000001',
        coalesce((select nullif(btrim(empresa_nombre), '') from public.configuracion order by id limit 1), 'Mi Empresa'))
on conflict (id) do nothing;

-- 2) La empresa de la sesión
alter table public.usuarios_perfil
  add column if not exists empresa_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.empresas (id);

create or replace function public.empresa_actual()
returns uuid language sql stable security definer set search_path = '' as $$
  select empresa_id from public.usuarios_perfil where id = auth.uid();
$$;

create or replace function public.empresa_unica()
returns uuid language sql stable security definer set search_path = '' as $$
  select case when count(*) = 1 then (array_agg(id))[1] end from public.empresas;
$$;

-- La empresa con la que se trabaja: la del usuario; si no hay usuario, la que se pidió para esta conexión (app.empresa: la plataforma al dar
-- de alta una empresa, o el servidor en la pantalla de entrada, antes de saber quién es); si no, la única que haya. Con un usuario, lo que
-- se pida en app.empresa no cuenta: nadie entra a otra empresa por pedirla.
-- (la usa la regla de cada tabla; anon la necesita para la pantalla de entrada, que lee la configuración: solo devuelve un id)
create or replace function public.empresa_de_la_sesion()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(public.empresa_actual(), nullif(current_setting('app.empresa', true), '')::uuid, public.empresa_unica());
$$;
revoke execute on function public.empresa_actual(), public.empresa_unica(), public.empresa_de_la_sesion() from public, anon;
grant execute on function public.empresa_actual(), public.empresa_unica() to authenticated, service_role;
grant execute on function public.empresa_de_la_sesion() to anon, authenticated, service_role;

-- La empresa de cada uno la ve el propio usuario (para mostrar su nombre); el resto lo maneja la plataforma.
drop policy if exists empresas_propia on public.empresas;
create policy empresas_propia on public.empresas for select to authenticated using (id = (select public.empresa_actual()));
grant select on public.empresas to authenticated;

-- 4) El rol de las funciones especiales: sin permiso para saltear las reglas
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_funciones') then
    create role app_funciones nologin nobypassrls;
  end if;
end $$;
-- (para poder pasarle funciones hay que ser miembro del rol)
grant app_funciones to current_user;
grant usage on schema public to app_funciones;
grant usage on schema auth to app_funciones;
grant execute on function auth.uid() to app_funciones;
grant select, insert, update, delete on all tables in schema public to app_funciones;
grant usage, select, update on all sequences in schema public to app_funciones;
grant execute on all functions in schema public to app_funciones;
alter default privileges in schema public grant select, insert, update, delete on tables to app_funciones;
alter default privileges in schema public grant usage, select, update on sequences to app_funciones;
alter default privileges in schema public grant execute on functions to app_funciones;
-- empresas: las funciones especiales ven la de la sesión (para leer su nombre, por ejemplo)
drop policy if exists empresas_funciones on public.empresas;
create policy empresas_funciones on public.empresas for select to app_funciones using (id = (select public.empresa_de_la_sesion()));

-- 3) Cada tabla, de una empresa
create or replace function public._de_empresa(p_tabla regclass)
returns void language plpgsql set search_path = '' as $$
declare
  v_nombre text := (select relname from pg_class where oid = p_tabla);
begin
  if not exists (select 1 from pg_attribute where attrelid = p_tabla and attname = 'empresa_id' and not attisdropped) then
    -- con un valor fijo, las filas que ya estaban quedan de la primera empresa sin reescribirlas ni disparar nada
    execute format('alter table %s add column empresa_id uuid not null default %L references public.empresas (id)',
                   p_tabla, '00000000-0000-0000-0000-000000000001');
  end if;
  execute format('alter table %s alter column empresa_id set default public.empresa_de_la_sesion()', p_tabla);
  execute format('create index if not exists %I on %s (empresa_id)', v_nombre || '_empresa_idx', p_tabla);
  execute format('alter table %s enable row level security', p_tabla);
  execute format('alter table %s force row level security', p_tabla);
  execute format('drop policy if exists solo_su_empresa on %s', p_tabla);
  execute format('create policy solo_su_empresa on %s as restrictive for all to public
                    using (empresa_id = (select public.empresa_de_la_sesion()))
                    with check (empresa_id = (select public.empresa_de_la_sesion()))', p_tabla);
  execute format('drop policy if exists funciones_de_la_app on %s', p_tabla);
  execute format('create policy funciones_de_la_app on %s for all to app_funciones using (true) with check (true)', p_tabla);
end $$;
revoke execute on function public._de_empresa(regclass) from public, anon, authenticated;

select public._de_empresa(t::regclass) from unnest(array[
  'public.usuarios_perfil', 'public.configuracion', 'public.licencia', 'public.preferencias_modulos', 'public.audit_log',
  'public.error_logs', 'public.sugerencias', 'public.tasks', 'public.task_history', 'public.avisos_vistos'
]) as t;

-- 5) Una fila por empresa (el id queda, siempre 1)
alter table public.configuracion drop constraint if exists configuracion_pkey;
alter table public.configuracion add constraint configuracion_pkey primary key (empresa_id);
alter table public.licencia drop constraint if exists licencia_pkey;
alter table public.licencia add constraint licencia_pkey primary key (empresa_id);
alter table public.preferencias_modulos drop constraint if exists preferencias_modulos_pkey;
alter table public.preferencias_modulos add constraint preferencias_modulos_pkey primary key (empresa_id);

-- Un usuario nuevo es de la empresa de quien lo crea (o de la que diga su cuenta, cuando lo crea la plataforma).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  insert into public.usuarios_perfil (id, nombre, apellido, email, rol, activo, access_status, empresa_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    '',
    coalesce(new.email, ''),
    'user',
    false,
    'active',
    coalesce(nullif(new.raw_app_meta_data->>'empresa_id', '')::uuid, public.empresa_de_la_sesion())
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El primer dueño, por empresa (lo usa el instalador, sin sesión).
create or replace function public.definir_dueno_inicial(p_email text)
returns void language plpgsql security definer set search_path = 'public' as $$
declare
  v_empresa uuid := (select empresa_id from usuarios_perfil where lower(email) = lower(p_email) limit 1);
begin
  if v_empresa is null then
    raise exception 'No existe un usuario con el email %. Crealo primero en Authentication.', p_email;
  end if;
  if exists (select 1 from usuarios_perfil where es_owner and empresa_id = v_empresa) then
    raise exception 'Esta instalación ya tiene un dueño definido.';
  end if;
  update usuarios_perfil
     set es_owner = true, rol = 'admin', mantenimiento_rol = 'admin', activo = true
   where lower(email) = lower(p_email);
end;
$$;

-- Siempre un dueño, en cada empresa (se controla también cuando cambia algo sin sesión, por eso filtra a mano).
create or replace function public.evitar_sin_owner()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  if not exists (select 1 from usuarios_perfil where es_owner = true and empresa_id = new.empresa_id) then
    raise exception 'El sistema debe tener siempre un dueño — asigná uno antes de sacar el actual.';
  end if;
  return null;
end;
$$;

-- Cada empresa, con uno o dos dueños (los que tienen todos los permisos dentro de su empresa). Se controla en la base: vale para la app,
-- para la plataforma y para cualquier camino.
create or replace function public.tope_de_duenos()
returns trigger language plpgsql security definer set search_path = 'public' as $$
begin
  if new.es_owner and (tg_op = 'INSERT' or old.es_owner is not true)
     and (select count(*) from usuarios_perfil where empresa_id = new.empresa_id and es_owner and id <> new.id) >= 2 then
    raise exception 'Cada empresa puede tener hasta dos dueños.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tope_de_duenos on public.usuarios_perfil;
create trigger trg_tope_de_duenos before insert or update of es_owner on public.usuarios_perfil
  for each row execute function public.tope_de_duenos();

-- Una empresa desactivada (por la plataforma) deja a todos sus usuarios como bloqueados.
create or replace function public.usuario_activo()
returns boolean language sql stable security definer set search_path = 'public' as $$
  select coalesce((select p.activo is true and e.activa from public.usuarios_perfil p join public.empresas e on e.id = p.empresa_id
                   where p.id = auth.uid()), false);
$$;

-- 4) Las funciones especiales, al rol que respeta las reglas. Las de la lista ven más de una empresa a propósito y filtran a mano.
create or replace function public._funciones_a_la_app()
returns void language plpgsql set search_path = '' as $$
declare
  f record;
begin
  -- (para pasarle una función, el rol tiene que poder crear en el esquema; se le da solo mientras dura el cambio: Supabase lo exige)
  grant create on schema public to app_funciones;
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proowner <> 'app_funciones'::regrole
      and p.proname not in ('empresa_actual', 'empresa_unica', 'empresa_de_la_sesion', 'handle_new_user', 'definir_dueno_inicial',
                            'evitar_sin_owner', 'rls_auto_enable')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s owner to app_funciones', f.firma);
  end loop;
  revoke create on schema public from app_funciones;
end $$;
revoke execute on function public._funciones_a_la_app() from public, anon, authenticated;
select public._funciones_a_la_app();
