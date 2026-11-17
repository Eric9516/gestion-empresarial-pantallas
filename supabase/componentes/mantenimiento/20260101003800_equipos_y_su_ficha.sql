-- Mantenimiento, etapa 1: los equipos y su ficha (diseño del encargado de mantenimiento con el socio; ver docs/MANTENIMIENTO.md).
--
--   * Sectores propios de Mantenimiento (aparte de los del Depósito), con sub-sectores: dos niveles fijos, ordenados por importancia.
--   * Equipos con código (lo lleva su QR), marca, modelo, serie, ubicación, etiquetas para encontrarlos, si es crítico, notas y,
--     si es una parte de otro (la bomba de un pasteurizador), su equipo principal. Un solo nivel: un sub-equipo no tiene sub-equipos.
--   * Repuestos críticos: los de equipo_items (repuestos del Depósito), ahora con cuántos conviene tener y una nota.
--   * Manuales en PDF (carpeta "manuales", privada: solo los ve quien ve Mantenimiento).
--   * Historial: lo que se hizo en cada equipo (correctivo o preventivo), con fecha, técnicos, horas y, en un correctivo, falla,
--     causa, solución y horas de equipo parado. (Las órdenes de trabajo y el preventivo programado son la etapa 2.)
--
-- Permisos (los roles son de la Base: ver la migración del mismo número): ve todo quien tenga un rol de Mantenimiento o sea dueño;
-- el historial lo escriben técnicos y administradores; lo demás, solo administradores. Lo que ya había en la tabla de equipos se conserva:
-- el sector pasa a ser un sector de verdad, los datos técnicos y el enlace al manual van a las notas, y cada uno recibe un código (EQ-001…).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------
-- 1) Sectores y sub-sectores
-- ---------------------------------------------------------------------------------------------
create table public.equipo_sectores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  -- null = sector; si no, es un sub-sector de ese sector
  padre_id uuid references public.equipo_sectores (id) on delete cascade,
  -- el orden por importancia que elige la empresa (los sub-sectores van por nombre)
  orden integer,
  created_at timestamptz not null default now()
);
select public._de_empresa('public.equipo_sectores'::regclass);
-- un mismo nombre una sola vez por nivel, sin importar mayúsculas ni tildes
create unique index equipo_sectores_nombre_uidx on public.equipo_sectores
  (empresa_id, coalesce(padre_id, '00000000-0000-0000-0000-000000000000'::uuid), public.texto_de_busqueda(btrim(nombre)));
create index equipo_sectores_padre_idx on public.equipo_sectores (empresa_id, padre_id);

create or replace function public.equipo_sectores_dos_niveles()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.padre_id is not null then
    if new.padre_id = new.id or exists (select 1 from public.equipo_sectores where id = new.padre_id and padre_id is not null) then
      raise exception 'Un sub-sector no puede tener sub-sectores: elegí un sector.';
    end if;
    if exists (select 1 from public.equipo_sectores where padre_id = new.id) then
      raise exception 'Este sector tiene sub-sectores: no puede pasar a ser sub-sector de otro.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_equipo_sectores_dos_niveles before insert or update of padre_id on public.equipo_sectores
  for each row execute function public.equipo_sectores_dos_niveles();

-- ---------------------------------------------------------------------------------------------
-- 2) Equipos
-- ---------------------------------------------------------------------------------------------
alter table public.equipos
  add column if not exists codigo text,
  add column if not exists sector_id uuid references public.equipo_sectores (id) on delete set null,
  add column if not exists padre_id uuid references public.equipos (id) on delete cascade,
  add column if not exists etiquetas text[] not null default '{}',
  add column if not exists marca text not null default '',
  add column if not exists modelo text not null default '',
  add column if not exists numero_serie text not null default '',
  add column if not exists ubicacion text not null default '',
  add column if not exists critico boolean not null default false,
  add column if not exists notas text not null default '';

-- Lo que ya había: cada sector escrito pasa a ser un sector, y los datos técnicos y el manual quedan en las notas.
insert into public.equipo_sectores (empresa_id, nombre)
select distinct on (empresa_id, public.texto_de_busqueda(btrim(sector))) empresa_id, left(btrim(sector), 80)
from public.equipos where btrim(coalesce(sector, '')) <> ''
order by empresa_id, public.texto_de_busqueda(btrim(sector)), btrim(sector);
update public.equipos e set sector_id = s.id
from public.equipo_sectores s
where s.empresa_id = e.empresa_id and s.padre_id is null and public.texto_de_busqueda(s.nombre) = public.texto_de_busqueda(left(btrim(e.sector), 80));
update public.equipos set notas = concat_ws(E'\n', nullif(btrim(datos_tecnicos), ''), 'Manual: ' || nullif(btrim(manual_url), ''))
where nullif(btrim(datos_tecnicos), '') is not null or nullif(btrim(manual_url), '') is not null;
with n as (select id, row_number() over (partition by empresa_id order by created_at, id) as k from public.equipos where codigo is null)
update public.equipos e set codigo = 'EQ-' || lpad(n.k::text, 3, '0') from n where n.id = e.id;

alter table public.equipos drop column sector, drop column datos_tecnicos, drop column manual_url;
alter table public.equipos alter column codigo set not null;
alter table public.equipos add constraint equipos_codigo_check check (length(btrim(codigo)) between 1 and 40);
alter table public.equipos add constraint equipos_nombre_check check (length(btrim(nombre)) between 1 and 160);
-- el código es único en la empresa (sin importar mayúsculas): es lo que lleva el QR
create unique index equipos_codigo_uidx on public.equipos (empresa_id, lower(btrim(codigo)));
create index equipos_sector_idx on public.equipos (empresa_id, sector_id);
create index equipos_padre_idx on public.equipos (empresa_id, padre_id);

create or replace function public.equipos_un_nivel()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.padre_id is not null then
    if new.padre_id = new.id then raise exception 'Un equipo no puede ser sub-equipo de sí mismo.'; end if;
    if exists (select 1 from public.equipos where id = new.padre_id and padre_id is not null) then
      raise exception 'El equipo elegido ya es un sub-equipo: elegí un equipo principal.';
    end if;
    if exists (select 1 from public.equipos where padre_id = new.id) then
      raise exception 'Este equipo tiene sub-equipos: no puede pasar a ser sub-equipo de otro.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_equipos_un_nivel before insert or update of padre_id on public.equipos
  for each row execute function public.equipos_un_nivel();

-- ---------------------------------------------------------------------------------------------
-- 3) Repuestos críticos: los repuestos del Depósito que conviene tener siempre para el equipo
-- ---------------------------------------------------------------------------------------------
alter table public.equipo_items
  add column if not exists cantidad numeric not null default 1 check (cantidad > 0 and cantidad <= 1000000),
  add column if not exists nota text not null default '',
  add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------------------------
-- 4) Manuales (PDF): el archivo va a la carpeta privada "manuales"; acá, su nombre y dónde está
-- ---------------------------------------------------------------------------------------------
create table public.equipo_manuales (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 200),
  ruta text not null,
  tamanio_bytes bigint,
  subido_por uuid references public.usuarios_perfil (id) on delete set null,
  created_at timestamptz not null default now()
);
select public._de_empresa('public.equipo_manuales'::regclass);
create index equipo_manuales_equipo_idx on public.equipo_manuales (empresa_id, equipo_id);
create index equipo_manuales_subido_por_idx on public.equipo_manuales (empresa_id, subido_por);

insert into storage.buckets (id, name, public) values ('manuales', 'manuales', false) on conflict (id) do nothing;
create policy manuales_select on storage.objects for select to authenticated
  using (bucket_id = 'manuales' and (select public.puede_ver_equipos()));
create policy manuales_write on storage.objects for all to authenticated
  using (bucket_id = 'manuales' and (select public.administra_equipos()))
  with check (bucket_id = 'manuales' and (select public.administra_equipos()));
create policy bloqueo_modulo_manuales on storage.objects as restrictive for all to public
  using (bucket_id <> 'manuales' or ((select public.modulo_activo('mantenimiento')) and (select public.modulo_activo('deposito'))))
  with check (bucket_id <> 'manuales' or ((select public.modulo_activo('mantenimiento')) and (select public.modulo_activo('deposito'))));

-- ---------------------------------------------------------------------------------------------
-- 5) Historial: lo que se hizo en cada equipo, y quiénes lo hicieron
-- ---------------------------------------------------------------------------------------------
create table public.equipo_intervenciones (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos (id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('correctivo', 'preventivo')),
  descripcion text not null check (length(btrim(descripcion)) between 1 and 4000),
  -- horas de trabajo
  horas numeric check (horas >= 0 and horas <= 100000),
  -- solo en un correctivo: qué tan urgente era, qué se vio, por qué pasó, qué se hizo y cuánto estuvo parado el equipo
  prioridad text check (prioridad in ('normal', 'urgente')),
  falla text not null default '' check (length(falla) <= 4000),
  causa text not null default '' check (length(causa) <= 4000),
  solucion text not null default '' check (length(solucion) <= 4000),
  horas_parada numeric check (horas_parada >= 0 and horas_parada <= 100000),
  -- los repuestos usados, escritos (en la etapa 2 se suman las líneas que descuentan stock)
  repuestos text not null default '' check (length(repuestos) <= 2000),
  creado_por uuid references public.usuarios_perfil (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select public._de_empresa('public.equipo_intervenciones'::regclass);
create index equipo_intervenciones_equipo_idx on public.equipo_intervenciones (empresa_id, equipo_id, fecha desc);
create index equipo_intervenciones_creado_por_idx on public.equipo_intervenciones (empresa_id, creado_por);
create trigger equipo_intervenciones_set_updated_at before update on public.equipo_intervenciones
  for each row execute function public.set_updated_at();

-- Quiénes hicieron el trabajo: técnicos de la app (su nombre queda escrito, por si un día se borra el usuario).
create table public.intervencion_tecnicos (
  id uuid primary key default gen_random_uuid(),
  intervencion_id uuid not null references public.equipo_intervenciones (id) on delete cascade,
  usuario_id uuid references public.usuarios_perfil (id) on delete set null,
  nombre text not null check (length(btrim(nombre)) between 1 and 160),
  orden smallint not null default 0
);
select public._de_empresa('public.intervencion_tecnicos'::regclass);
create index intervencion_tecnicos_intervencion_idx on public.intervencion_tecnicos (empresa_id, intervencion_id);
create index intervencion_tecnicos_usuario_idx on public.intervencion_tecnicos (empresa_id, usuario_id);

-- ---------------------------------------------------------------------------------------------
-- 6) Quién ve y quién cambia cada cosa
-- ---------------------------------------------------------------------------------------------
drop policy if exists equipos_select on public.equipos;
drop policy if exists equipos_write on public.equipos;
drop policy if exists equipo_items_select on public.equipo_items;
drop policy if exists equipo_items_write on public.equipo_items;

do $$
declare
  t text;
begin
  foreach t in array array['equipo_sectores', 'equipos', 'equipo_items', 'equipo_manuales', 'equipo_intervenciones', 'intervencion_tecnicos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- ver: quien tenga un rol de Mantenimiento (o sea dueño)
    execute format('create policy %I on public.%I for select to authenticated using ((select public.puede_ver_equipos()))', t || '_select', t);
    -- el módulo prendido (y el Depósito, del que salen los repuestos) y un usuario activo, siempre
    execute format('drop policy if exists bloqueo_modulo on public.%I', t);
    execute format('create policy bloqueo_modulo on public.%I as restrictive for all to public
                      using ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))
                      with check ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))', t);
    execute format('drop policy if exists requiere_usuario_activo on public.%I', t);
    execute format('create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated
                      using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
  -- la ficha del equipo: solo quien administra Mantenimiento
  foreach t in array array['equipo_sectores', 'equipos', 'equipo_items', 'equipo_manuales'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.administra_equipos()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.administra_equipos())) with check ((select public.administra_equipos()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.administra_equipos()))', t || '_delete', t);
  end loop;
  -- el historial: lo registran y corrigen los técnicos; borrarlo, solo quien administra
  foreach t in array array['equipo_intervenciones', 'intervencion_tecnicos'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.trabaja_en_equipos()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.trabaja_en_equipos())) with check ((select public.trabaja_en_equipos()))', t || '_update', t);
  end loop;
  create policy equipo_intervenciones_delete on public.equipo_intervenciones for delete to authenticated using ((select public.administra_equipos()));
  -- (al corregir un registro, sus técnicos se reemplazan: el técnico los puede sacar)
  create policy intervencion_tecnicos_delete on public.intervencion_tecnicos for delete to authenticated using ((select public.trabaja_en_equipos()));
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7) Lo que Mantenimiento lee del Depósito. Quien ve Mantenimiento no siempre tiene acceso al Depósito (alguien de Producción con
--    "solo consulta"), pero tiene que ver el stock de los repuestos críticos; y quien administra los equipos tiene que poder elegirlos.
-- ---------------------------------------------------------------------------------------------
create or replace function public.repuestos_criticos_de(p_equipos uuid[])
returns table (equipo_id uuid, item_id uuid, codigo text, descripcion text, stock numeric, ubicacion text, deposito text, cantidad numeric, nota text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.puede_ver_equipos()) then return; end if;
  return query
    select ei.equipo_id, i.id, i.codigo, i.descripcion, i.stock, i.ubicacion, d.nombre, ei.cantidad, ei.nota
    from public.equipo_items ei
    join public.items i on i.id = ei.item_id
    left join public.depositos d on d.id = i.deposito_id
    where ei.equipo_id = any (p_equipos)
    order by i.codigo;
end $$;
revoke execute on function public.repuestos_criticos_de(uuid[]) from public, anon;
grant execute on function public.repuestos_criticos_de(uuid[]) to authenticated, service_role;

-- Buscar un repuesto (de cualquier depósito) por código, descripción o palabras clave: cada palabra tiene que estar.
create or replace function public.repuestos_para_equipos(p_texto text, p_limite integer default 8)
returns table (id uuid, codigo text, descripcion text, stock numeric, deposito text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_palabras text[] := array(
    select replace(replace(replace(x, '\', '\\'), '%', '\%'), '_', '\_')
    from regexp_split_to_table(public.texto_de_busqueda(btrim(coalesce(p_texto, ''))), '\s+') x where x <> '' limit 8);
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) or cardinality(v_palabras) = 0 then return; end if;
  return query
    select i.id, i.codigo, i.descripcion, i.stock, d.nombre
    from public.items i
    left join public.depositos d on d.id = i.deposito_id
    where i.activo
      and not exists (
        select 1 from unnest(v_palabras) p
        where public.texto_de_busqueda(concat_ws(' ', i.codigo, i.descripcion, i.palabras_clave)) not like '%' || p || '%')
    order by i.codigo
    limit least(greatest(coalesce(p_limite, 8), 1), 30);
end $$;
revoke execute on function public.repuestos_para_equipos(text, integer) from public, anon;
grant execute on function public.repuestos_para_equipos(text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 8) Lo de siempre de cada tabla nueva: vínculos dentro de la empresa, funciones con el rol que respeta las reglas y sin permisos de más
-- ---------------------------------------------------------------------------------------------
select public._vinculos_por_empresa();
select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
