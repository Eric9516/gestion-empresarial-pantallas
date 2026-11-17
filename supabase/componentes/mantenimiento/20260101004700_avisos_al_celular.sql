-- Avisos al celular de Mantenimiento (pedido del dueño, 12/11/2026): cuando una OT avanza en el circuito, le llega un aviso al teléfono de quien
-- tiene que hacer el paso siguiente, aunque tenga la app cerrada. Gratis: son los avisos de los propios navegadores ("web push").
--
--   Técnico         · le asignan una OT                       · le devuelven una OT (con el comentario)
--   Jefe de taller  · le derivan OT para asignar               · un técnico terminó una OT (para revisar; dentro del horario de recepción)
--   Responsable     · un resumen a la mañana de las preventivas para derivar · el jefe revisó una OT (para aprobar)
--   (si la empresa no tiene jefe de taller, lo del jefe le llega al responsable, como en la app)
--
-- Vienen prendidos para todos; el dueño y el responsable los apagan por persona (Configuración → Mantenimiento → Avisos).
-- La base solo anota qué hay que avisar (avisos_cola); los manda el servidor de la app cada minuto (web/src/lib/avisosAlCelular.ts), que
-- antes de mandar cada uno se fija que siga valiendo (si la OT ya avanzó, no se avisa) y que ya sea hora (horario de recepción).

set check_function_bodies = off;

-- Los celulares (navegadores) donde cada persona activó los avisos. "endpoint" es la dirección que da el navegador para mandarle avisos.
create table public.avisos_celulares (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios_perfil (id) on delete cascade,
  endpoint text not null check (length(endpoint) between 20 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 10 and 100),
  navegador text not null default '' check (length(navegador) <= 200),
  created_at timestamptz not null default now(),
  usado_at timestamptz not null default now()
);

-- Los avisos que el dueño o el responsable le apagaron a una persona (sin fila = prendido).
create table public.avisos_apagados (
  usuario_id uuid not null references public.usuarios_perfil (id) on delete cascade,
  tipo text not null check (tipo in ('asignada', 'devuelta', 'para_asignar', 'para_revisar', 'para_derivar', 'para_aprobar'))
);

-- Lo que hay que avisar. "cantidad" la usa el resumen de la mañana (cuántas preventivas hay para derivar).
create table public.avisos_cola (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios_perfil (id) on delete cascade,
  tipo text not null check (tipo in ('asignada', 'devuelta', 'para_asignar', 'para_revisar', 'para_derivar', 'para_aprobar', 'prueba')),
  ot_id uuid references public.ordenes_trabajo (id) on delete cascade,
  cantidad integer not null default 1 check (cantidad >= 0),
  creado_at timestamptz not null default now(),
  enviado_at timestamptz
);

select public._de_empresa(t::regclass) from unnest(array['public.avisos_celulares', 'public.avisos_apagados', 'public.avisos_cola']) as t;
alter table public.avisos_apagados add constraint avisos_apagados_pkey primary key (empresa_id, usuario_id, tipo);
create unique index avisos_celulares_endpoint_idx on public.avisos_celulares (empresa_id, endpoint);
create index avisos_celulares_usuario_idx on public.avisos_celulares (empresa_id, usuario_id);
create index avisos_cola_pendientes_idx on public.avisos_cola (creado_at) where enviado_at is null;
create index avisos_cola_ot_idx on public.avisos_cola (empresa_id, ot_id, usuario_id, tipo);
create index avisos_cola_usuario_idx on public.avisos_cola (empresa_id, usuario_id);
-- Nadie las lee ni las escribe directo: solo con las funciones de abajo. (Las reglas de siempre, por si un día se les da permiso.)
revoke all on public.avisos_celulares, public.avisos_apagados, public.avisos_cola from anon, authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['avisos_celulares', 'avisos_apagados', 'avisos_cola'] loop
    execute format('create policy bloqueo_modulo on public.%I as restrictive for all to public
                      using ((select public.modulo_activo(''mantenimiento''))) with check ((select public.modulo_activo(''mantenimiento'')))', t);
    execute format('create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated
                      using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- A quién le toca cada cosa
-- ---------------------------------------------------------------------------------------------
-- El responsable de mantenimiento: el administrador del área y el dueño (como rolDeMantenimiento en la app).
create or replace function public._responsables_de_mantenimiento()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from public.usuarios_perfil where activo and (es_owner or rol_equipos = 'admin');
$$;

-- El jefe de taller; si la empresa no tiene, el responsable (que mientras tanto hace sus pasos).
create or replace function public._jefes_de_taller()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select coalesce(array_agg(id), '{}') from public.usuarios_perfil where activo and rol_equipos = 'jefe'), '{}'),
                  public._responsables_de_mantenimiento());
$$;

-- Anota un aviso para cada uno (menos para quien hizo el paso: no se avisa a sí mismo).
create or replace function public._avisar(p_tipo text, p_ot uuid, p_usuarios uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.avisos_cola (usuario_id, tipo, ot_id)
  select distinct u, p_tipo, p_ot from unnest(coalesce(p_usuarios, '{}')) as u where u is not null and u is distinct from auth.uid();
end $$;

-- Cuando la OT cambia de etapa (o nace en una).
create or replace function public._avisos_de_la_ot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.etapa is not distinct from old.etapa then return null; end if;
  if new.etapa = 'por_asignar' then
    perform public._avisar('para_asignar', new.id, public._jefes_de_taller());
  elsif new.etapa = 'a_revisar' then
    perform public._avisar('para_revisar', new.id, public._jefes_de_taller());
  elsif new.etapa = 'para_aprobar' then
    perform public._avisar('para_aprobar', new.id, public._responsables_de_mantenimiento());
  elsif new.etapa = 'asignada' and tg_op = 'UPDATE' and old.etapa in ('a_revisar', 'para_aprobar') then
    perform public._avisar('devuelta', new.id, array(select usuario_id from public.ot_asignados where ot_id = new.id));
  end if;
  return null;
end $$;

create trigger avisos_de_la_ot after insert or update of etapa on public.ordenes_trabajo
  for each row execute function public._avisos_de_la_ot();

-- Cuando a alguien le asignan una OT (al reasignar se vuelven a anotar todos: al que ya la tenía no se le avisa de nuevo).
create or replace function public._aviso_de_asignacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usuario_id is not null and new.usuario_id is distinct from auth.uid()
     and not exists (select 1 from public.avisos_cola where ot_id = new.ot_id and usuario_id = new.usuario_id and tipo = 'asignada') then
    insert into public.avisos_cola (usuario_id, tipo, ot_id) values (new.usuario_id, 'asignada', new.ot_id);
  end if;
  return null;
end $$;

create trigger aviso_de_asignacion after insert on public.ot_asignados
  for each row execute function public._aviso_de_asignacion();

-- ---------------------------------------------------------------------------------------------
-- Lo que usa la app
-- ---------------------------------------------------------------------------------------------
-- Activar los avisos en este celular (o volver a anotarlo: el navegador puede cambiar la dirección). Si en el mismo celular entra otra
-- persona, el celular pasa a ser suyo.
create or replace function public.guardar_celular(p_endpoint text, p_p256dh text, p_auth text, p_navegador text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) then raise exception 'Los avisos al celular son para quienes trabajan en Mantenimiento.'; end if;
  delete from public.avisos_celulares where endpoint = p_endpoint and usuario_id is distinct from auth.uid();
  insert into public.avisos_celulares (usuario_id, endpoint, p256dh, auth, navegador)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_navegador, ''), 200))
  on conflict (empresa_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, navegador = excluded.navegador, usado_at = now();
  -- como mucho 10 celulares por persona (los más viejos se olvidan)
  delete from public.avisos_celulares where usuario_id = auth.uid()
    and id not in (select id from public.avisos_celulares where usuario_id = auth.uid() order by usado_at desc limit 10);
end $$;

-- Desactivar los avisos en este celular.
create or replace function public.quitar_celular(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.avisos_celulares where endpoint = p_endpoint and usuario_id = auth.uid();
$$;

-- Configuración → Mantenimiento → Avisos: cada persona del área, en cuántos celulares activó los avisos y cuáles tiene apagados.
create or replace function public.avisos_del_equipo()
returns table (usuario_id uuid, nombre text, rol text, celulares integer, apagados text[])
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) then raise exception 'Solo el dueño y el responsable de mantenimiento ven los avisos.'; end if;
  return query
  select u.id, coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email),
         case when u.es_owner or u.rol_equipos = 'admin' then 'responsable' when u.rol_equipos = 'jefe' then 'jefe' else 'tecnico' end,
         (select count(*)::integer from public.avisos_celulares c where c.usuario_id = u.id),
         coalesce((select array_agg(a.tipo order by a.tipo) from public.avisos_apagados a where a.usuario_id = u.id), '{}')
  from public.usuarios_perfil u
  where u.activo and (u.es_owner or u.rol_equipos in ('admin', 'jefe', 'tecnico'))
  order by case when u.es_owner or u.rol_equipos = 'admin' then 0 when u.rol_equipos = 'jefe' then 1 else 2 end, 2;
end $$;

-- Prender o apagar un aviso a una persona (solo el dueño y el responsable).
create or replace function public.cambiar_aviso(p_usuario uuid, p_tipo text, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) then raise exception 'Solo el dueño y el responsable de mantenimiento cambian los avisos.'; end if;
  if not exists (select 1 from public.usuarios_perfil where id = p_usuario) then raise exception 'No se encontró a esa persona.'; end if;
  if p_activo then
    delete from public.avisos_apagados where usuario_id = p_usuario and tipo = p_tipo;
  else
    insert into public.avisos_apagados (usuario_id, tipo) values (p_usuario, p_tipo) on conflict do nothing;
  end if;
end $$;

-- Un aviso de prueba: a uno mismo, o (el dueño y el responsable) a cualquiera del área.
create or replace function public.probar_aviso(p_usuario uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_quien uuid := coalesce(p_usuario, auth.uid());
begin
  perform public.exigir_modulo('mantenimiento');
  if v_quien is distinct from auth.uid() and not (select public.administra_equipos()) then raise exception 'Solo podés probar tus propios avisos.'; end if;
  if v_quien = auth.uid() and not (select public.trabaja_en_equipos()) then raise exception 'Los avisos al celular son para quienes trabajan en Mantenimiento.'; end if;
  insert into public.avisos_cola (usuario_id, tipo) values (v_quien, 'prueba');
  return (select count(*)::integer from public.avisos_celulares where usuario_id = v_quien);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array['public._responsables_de_mantenimiento()', 'public._jefes_de_taller()', 'public._avisar(text, uuid, uuid[])',
                           'public._avisos_de_la_ot()', 'public._aviso_de_asignacion()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.guardar_celular(text, text, text, text)', 'public.quitar_celular(text)', 'public.avisos_del_equipo()',
                           'public.cambiar_aviso(uuid, text, boolean)', 'public.probar_aviso(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

select public._vinculos_por_empresa();
select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
