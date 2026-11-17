-- El login propio (Next): sesiones e intentos fallidos. Vive en su propio esquema, "servidor", que Supabase no tiene:
-- la copia de respaldo a Supabase lleva public y auth.users, y esto queda solo acá.
--
-- Next se conecta con el rol app_web, que no toca estas tablas directo: solo usa las funciones de abajo (dueñas de postgres).
-- El token de la sesión viaja en una cookie; acá se guarda solo su huella (sha-256), así una copia de la base no sirve para entrar.

create schema servidor;
revoke all on schema servidor from public;

create table servidor.sesiones (
  huella bytea primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  creada timestamptz not null default now(),
  usada timestamptz not null default now(),
  vence timestamptz not null,
  ip text,
  navegador text
);
create index sesiones_usuario on servidor.sesiones (usuario_id);
create index sesiones_vence on servidor.sesiones (vence);

create table servidor.intentos (
  id bigint generated always as identity primary key,
  momento timestamptz not null default now(),
  email text not null,
  ip text,
  ok boolean not null
);
create index intentos_email on servidor.intentos (lower(email), momento desc);
create index intentos_ip on servidor.intentos (ip, momento desc);

-- Duración: 30 días desde el último uso (cada día de uso la estira).
create function servidor._duracion() returns interval language sql immutable as $$ select interval '30 days' $$;

-- Lo necesario para revisar una contraseña. Si la cuenta no existe, no devuelve nada (y Next igual tarda lo mismo).
create function servidor.datos_para_entrar(p_email text)
returns table (id uuid, hash text, activo boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.encrypted_password,
         coalesce(p.activo, false) and (u.banned_until is null or u.banned_until < now())
  from auth.users u left join public.usuarios_perfil p on p.id = u.id
  where lower(u.email) = lower(trim(p_email)) and u.deleted_at is null
  limit 1
$$;

-- Freno a quien prueba contraseñas: 5 fallos seguidos de un correo o 30 de una dirección en 15 minutos.
create function servidor.puede_intentar(p_email text, p_ip text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select count(*) from servidor.intentos
          where lower(email) = lower(trim(p_email)) and not ok and momento > now() - interval '15 minutes'
            and momento > coalesce((select max(momento) from servidor.intentos where lower(email) = lower(trim(p_email)) and ok), '-infinity')) < 5
     and (select count(*) from servidor.intentos where ip = p_ip and not ok and momento > now() - interval '15 minutes') < 30
$$;

create function servidor.registrar_intento(p_email text, p_ip text, p_ok boolean) returns void
language sql security definer set search_path = '' as $$
  insert into servidor.intentos (email, ip, ok) values (lower(trim(p_email)), p_ip, p_ok);
  delete from servidor.intentos where momento < now() - interval '30 days';
$$;

create function servidor.abrir_sesion(p_usuario uuid, p_huella bytea, p_ip text, p_navegador text) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_vence timestamptz := now() + servidor._duracion();
begin
  insert into servidor.sesiones (huella, usuario_id, vence, ip, navegador) values (p_huella, p_usuario, v_vence, p_ip, left(p_navegador, 300));
  update auth.users set last_sign_in_at = now() where id = p_usuario;
  delete from servidor.sesiones where vence < now();
  return v_vence;
end $$;

-- De quién es la sesión (nada si venció, si la cuenta se desactivó o se borró). La estira una vez por día de uso.
create function servidor.usuario_de_sesion(p_huella bytea) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid;
begin
  select s.usuario_id into v_usuario
  from servidor.sesiones s join auth.users u on u.id = s.usuario_id join public.usuarios_perfil p on p.id = s.usuario_id
  where s.huella = p_huella and s.vence > now() and p.activo and u.deleted_at is null
    and (u.banned_until is null or u.banned_until < now());
  if v_usuario is not null then
    update servidor.sesiones set usada = now(), vence = now() + servidor._duracion()
    where huella = p_huella and usada < now() - interval '1 day';
  end if;
  return v_usuario;
end $$;

create function servidor.cerrar_sesion(p_huella bytea) returns void
language sql security definer set search_path = '' as $$
  delete from servidor.sesiones where huella = p_huella
$$;

revoke all on all functions in schema servidor from public;
