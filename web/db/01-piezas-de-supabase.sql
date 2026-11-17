-- Lo que la base de la app espera encontrar de Supabase, en una PostgreSQL común (el servidor propio).
-- Las migraciones de supabase/componentes se aplican después, tal cual: las reglas de seguridad (RLS) siguen preguntando auth.uid(),
-- y Next le dice a la base quién es el usuario en cada consulta (ver web/src/lib/db.ts).
--
-- auth.users tiene las columnas de Supabase que se usan para entrar y las que trae la copia de Cremac (mismos nombres y tipos),
-- así la contraseña de cada uno sigue sirviendo: Supabase la guarda con bcrypt, igual que acá.

-- (los roles son de todo el servidor: si ya se creó otra base antes, ya existen)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create schema extensions;
create schema storage;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index users_email_unico on auth.users (lower(email)) where deleted_at is null;

-- Igual que en Supabase: primero el "sub" suelto y, si no está, el de los claims completos.
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;

-- Archivos (fotos, logos): la misma tabla que Supabase, con su protección por filas encendida (como allá): las reglas de las migraciones
-- (quién sube a cada carpeta) valen igual. Los archivos en sí se guardan en disco (web/src/lib/archivos.ts); acá queda el registro.
create table storage.buckets (id text primary key, name text unique not null, public boolean default false, file_size_limit bigint,
  allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
  owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());

alter table storage.objects enable row level security;

grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
