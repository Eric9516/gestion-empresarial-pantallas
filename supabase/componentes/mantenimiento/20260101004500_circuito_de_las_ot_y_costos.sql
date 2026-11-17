-- Lo que diseñó el socio con el encargado entre el 05 y el 10/11/2026 (su repositorio de pantallas, "modificaciones varias"):
--
-- 1) El circuito de las OT. Preventivas: las genera la rutina y le llegan al responsable de mantenimiento, que las DERIVA al jefe de taller; el
--    jefe las ASIGNA a uno o varios técnicos; el técnico las TERMINA con su usuario; el jefe las REVISA (o las devuelve con un comentario) y el
--    responsable las APRUEBA. Recién al aprobarla va al historial del equipo y se descuentan los repuestos. Correctivas: el técnico las CARGA ya
--    hechas (las fallas entran por el teléfono de guardia) y siguen igual desde "revisar". Cada paso queda anotado (quién y cuándo).
--    En la base: ordenes_trabajo.etapa, ot_asignados, ot_pasos y una función por paso. Terminar = la mitad de lo que hacía cerrar_ot (lo que
--    cargó el técnico queda en la OT, y la rutina pasa a su fecha siguiente); aprobar = la otra mitad (historial, stock y OT nuevas).
-- 2) Disponibilidad: las horas de equipo parado se anotan también en los preventivos (antes, solo en los correctivos).
-- 3) Costos por equipo: el precio de cada repuesto usado (se anota al terminar la OT), un valor de hora único y los gastos externos.
-- 4) Horario de recepción: las OT terminadas les llegan al jefe y al responsable solo dentro de ese horario (lo filtra la pantalla).
--
-- No se borra nada: las OT que ya existen siguen (las terminadas quedan "aprobadas"; las abiertas, asignadas a quien las tenía).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------
-- 1) Columnas y tablas nuevas
-- ---------------------------------------------------------------------------------------------
alter table public.ordenes_trabajo
  add column if not exists etapa text not null default 'por_asignar'
    check (etapa in ('por_derivar', 'por_asignar', 'asignada', 'a_revisar', 'para_aprobar', 'aprobada')),
  -- cuándo la terminó el técnico (de ahí sale cuándo les llega al jefe y al responsable)
  add column if not exists terminada_at timestamptz;

alter table public.ot_repuestos add column if not exists precio numeric check (precio >= 0 and precio <= 1000000000000);

alter table public.equipo_intervenciones
  add column if not exists revisado_por text not null default '' check (length(revisado_por) <= 160),
  add column if not exists aprobado_por text not null default '' check (length(aprobado_por) <= 160);

alter table public.mantenimiento_config
  add column if not exists costo_hora numeric check (costo_hora >= 0 and costo_hora <= 1000000000),
  -- una franja por día de la semana (0 = domingo): de fábrica, lunes a viernes de 8:30 a 17 y sábados de 8:30 a 12
  add column if not exists horario_recepcion jsonb not null default
    '[{"dia":1,"desde":"08:30","hasta":"17:00"},{"dia":2,"desde":"08:30","hasta":"17:00"},{"dia":3,"desde":"08:30","hasta":"17:00"},{"dia":4,"desde":"08:30","hasta":"17:00"},{"dia":5,"desde":"08:30","hasta":"17:00"},{"dia":6,"desde":"08:30","hasta":"12:00"}]'
    check (jsonb_typeof(horario_recepcion) = 'array' and jsonb_array_length(horario_recepcion) <= 7);

-- Los técnicos asignados a una OT (su nombre queda escrito, por si un día se borra el usuario).
create table public.ot_asignados (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ordenes_trabajo (id) on delete cascade,
  orden smallint not null default 0,
  usuario_id uuid references public.usuarios_perfil (id) on delete set null,
  nombre text not null check (length(btrim(nombre)) between 1 and 160)
);

-- El recorrido de la OT: quién la derivó, asignó, terminó, revisó, devolvió o aprobó, y cuándo.
create table public.ot_pasos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ordenes_trabajo (id) on delete cascade,
  cuando timestamptz not null default now(),
  usuario_id uuid references public.usuarios_perfil (id) on delete set null,
  quien text not null check (length(quien) <= 160),
  accion text not null check (length(btrim(accion)) between 1 and 300),
  comentario text not null default '' check (length(comentario) <= 2000)
);

-- Servicios externos (un técnico de afuera, un taller, un service), cargados directo en el equipo.
create table public.equipo_gastos_externos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos (id) on delete cascade,
  fecha date not null,
  proveedor text not null default '' check (length(proveedor) <= 160),
  descripcion text not null check (length(btrim(descripcion)) between 1 and 500),
  monto numeric not null check (monto >= 0 and monto <= 1000000000000),
  creado_por uuid references public.usuarios_perfil (id) on delete set null,
  created_at timestamptz not null default now()
);

select public._de_empresa(t::regclass) from unnest(array['public.ot_asignados', 'public.ot_pasos', 'public.equipo_gastos_externos']) as t;
create index ot_asignados_ot_idx on public.ot_asignados (empresa_id, ot_id, orden);
create index ot_asignados_usuario_idx on public.ot_asignados (empresa_id, usuario_id);
create index ot_pasos_ot_idx on public.ot_pasos (empresa_id, ot_id, cuando);
create index ot_pasos_usuario_idx on public.ot_pasos (empresa_id, usuario_id);
create index equipo_gastos_externos_equipo_idx on public.equipo_gastos_externos (empresa_id, equipo_id, fecha desc);
create index equipo_gastos_externos_creado_por_idx on public.equipo_gastos_externos (empresa_id, creado_por);
-- la disponibilidad lee el historial por fecha (todos los equipos de un período)
create index if not exists equipo_intervenciones_fecha_idx on public.equipo_intervenciones (empresa_id, fecha);

do $$
declare
  t text;
begin
  foreach t in array array['ot_asignados', 'ot_pasos', 'equipo_gastos_externos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.puede_ver_equipos()))', t || '_select', t);
    execute format('create policy bloqueo_modulo on public.%I as restrictive for all to public
                      using ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))
                      with check ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))', t);
    execute format('create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated
                      using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
end $$;
-- los asignados y el recorrido los escriben solo las funciones del circuito; los gastos externos, quien administra Mantenimiento
create policy equipo_gastos_externos_write on public.equipo_gastos_externos for all to authenticated
  using ((select public.administra_equipos())) with check ((select public.administra_equipos()));

-- ---------------------------------------------------------------------------------------------
-- 2) Las OT que ya existían (nada se borra): las terminadas ya están en el historial (aprobadas); las abiertas, con quien las tenía asignada
-- ---------------------------------------------------------------------------------------------
select set_config('app.cerrando_ot', 'on', true);
update public.ordenes_trabajo set etapa = 'aprobada', terminada_at = coalesce(updated_at, now()) where estado = 'terminada';
insert into public.ot_asignados (ot_id, usuario_id, nombre, empresa_id)
select o.id, u.id, coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email, 'Técnico'), o.empresa_id
from public.ordenes_trabajo o join public.usuarios_perfil u on u.id = o.asignado_id
where o.estado <> 'terminada';
update public.ordenes_trabajo set etapa = case when asignado_id is not null then 'asignada' when tipo = 'preventiva' then 'por_derivar' else 'por_asignar' end
where estado <> 'terminada';
select set_config('app.cerrando_ot', 'off', true);

-- ---------------------------------------------------------------------------------------------
-- 3) La etapa solo cambia con los botones del circuito (las funciones de abajo avisan con app.cerrando_ot)
-- ---------------------------------------------------------------------------------------------
create or replace function public.ordenes_trabajo_proteger()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.cerrando_ot', true), '') = 'on' or pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.estado = 'terminada' then raise exception 'Una OT terminada no se borra: queda en el historial del equipo.'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'terminada' then raise exception 'La % ya está terminada: no se puede cambiar.', 'OT-' || lpad(old.numero::text, 4, '0'); end if;
  if new.estado = 'terminada' then raise exception 'Para terminar una OT usá el botón Terminar.'; end if;
  if tg_op = 'UPDATE' and (new.etapa is distinct from old.etapa or new.terminada_at is distinct from old.terminada_at) then
    raise exception 'La OT pasa de una etapa a otra con los botones (derivar, asignar, terminar, revisar, aprobar).';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4) La OT de cada rutina: ahora nace "para derivar" y sin técnico (lo asigna el jefe de taller; el responsable de la rutina queda como
--    sugerencia). Reemplaza la versión de la etapa 3.
-- ---------------------------------------------------------------------------------------------
create or replace function public._sincronizar_rutina(p_rutina uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.rutinas_preventivas;
  v_ot public.ordenes_trabajo;
  v_id uuid;
  v_antes text := coalesce(current_setting('app.cerrando_ot', true), '');
begin
  perform set_config('app.cerrando_ot', 'on', true);
  select * into r from public.rutinas_preventivas where id = p_rutina;
  if not found or not r.activa then
    delete from public.ordenes_trabajo where rutina_id = p_rutina and estado = 'pendiente';
    perform set_config('app.cerrando_ot', v_antes, true);
    return;
  end if;
  select * into v_ot from public.ordenes_trabajo where rutina_id = p_rutina and estado <> 'terminada' order by created_at limit 1 for update;
  if not found then
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, rutina_id, fecha_programada, etapa, creado_por)
    values (public.siguiente_numero('OT'), 'preventiva', r.equipo_id, r.id, r.proxima_fecha, 'por_derivar', auth.uid())
    returning id into v_id;
    perform public._copiar_rutina_a_ot(r.id, v_id);
  elsif v_ot.estado = 'pendiente' then
    update public.ordenes_trabajo set fecha_programada = r.proxima_fecha, equipo_id = r.equipo_id where id = v_ot.id;
    -- las marcas y los valores se conservan solo si las tareas (y sus mediciones) son las mismas
    if (select coalesce(jsonb_agg(jsonb_build_array(texto, mide, unidad, minimo, maximo) order by orden), '[]') from public.ot_tareas where ot_id = v_ot.id)
       is distinct from (select coalesce(jsonb_agg(jsonb_build_array(texto, mide, unidad, minimo, maximo) order by orden), '[]') from public.rutina_tareas where rutina_id = r.id)
    then
      delete from public.ot_tareas where ot_id = v_ot.id;
      insert into public.ot_tareas (ot_id, orden, texto, mide, unidad, minimo, maximo)
      select v_ot.id, orden, texto, mide, unidad, minimo, maximo from public.rutina_tareas where rutina_id = r.id order by orden;
    end if;
    delete from public.ot_repuestos where ot_id = v_ot.id;
    insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
    select v_ot.id, orden, componente, item_id, codigo, descripcion, cantidad from public.rutina_repuestos where rutina_id = r.id order by orden;
  end if;
  perform set_config('app.cerrando_ot', v_antes, true);
end $$;

-- Un paso del recorrido, a nombre de quien está usando la app.
create or replace function public._paso_ot(p_ot uuid, p_accion text, p_comentario text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ot_pasos (ot_id, usuario_id, quien, accion, comentario)
  select p_ot, auth.uid(), coalesce((select coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email) from public.usuarios_perfil u where u.id = auth.uid()), 'Alguien'),
         left(p_accion, 300), left(coalesce(p_comentario, ''), 2000);
end $$;

-- Asignar técnicos (reemplaza los que tenía). El primero queda también como "asignado" de siempre (lo usan Mis OT y el calendario).
create or replace function public._asignar_ot(p_ot uuid, p_usuarios uuid[])
returns text language plpgsql security definer set search_path = public as $$
declare
  v_nombres text;
begin
  delete from public.ot_asignados where ot_id = p_ot;
  insert into public.ot_asignados (ot_id, orden, usuario_id, nombre)
  select p_ot, x.n, u.id, coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email)
  from unnest(p_usuarios) with ordinality as x(id, n) join public.usuarios_perfil u on u.id = x.id
  where u.activo and (u.es_owner or u.rol_equipos in ('admin', 'jefe', 'tecnico'))
  order by x.n;
  select string_agg(nombre, ', ' order by orden) into v_nombres from public.ot_asignados where ot_id = p_ot;
  if v_nombres is null then raise exception 'Elegí al menos un técnico.'; end if;
  update public.ordenes_trabajo set asignado_id = (select usuario_id from public.ot_asignados where ot_id = p_ot order by orden limit 1), etapa = 'asignada'
  where id = p_ot;
  return v_nombres;
end $$;

-- Una OT correctiva programada a mano (como antes): con técnico, nace asignada; sin técnico, para que la asigne el jefe de taller.
create or replace function public.crear_ot_correctiva(p jsonb)
returns table (id uuid, numero bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_numero bigint;
  v_asignado uuid := nullif(p ->> 'asignado_id', '')::uuid;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) then raise exception 'No tenés permiso para crear órdenes de trabajo.'; end if;
  if not exists (select 1 from public.equipos e where e.id = (p ->> 'equipo_id')::uuid) then raise exception 'Elegí el equipo.'; end if;
  if jsonb_array_length(coalesce(p -> 'tareas', '[]')) = 0 then raise exception 'Escribí qué hay que hacer.'; end if;
  v_numero := public.siguiente_numero('OT');
  perform set_config('app.cerrando_ot', 'on', true);
  insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, prioridad, falla, etapa, creado_por)
  values (v_numero, 'correctiva', (p ->> 'equipo_id')::uuid, coalesce((p ->> 'fecha')::date, public.hoy_local()),
          case when p ->> 'prioridad' = 'urgente' then 'urgente' else 'normal' end, left(coalesce(p ->> 'falla', ''), 4000), 'por_asignar', auth.uid())
  returning ordenes_trabajo.id into v_id;
  insert into public.ot_tareas (ot_id, orden, texto, mide, unidad, minimo, maximo)
  select v_id, n,
         left(btrim(case when jsonb_typeof(t) = 'string' then t #>> '{}' else t ->> 'texto' end), 500),
         coalesce((t ->> 'mide')::boolean, false) and jsonb_typeof(t) = 'object',
         left(coalesce(case when jsonb_typeof(t) = 'object' then t ->> 'unidad' end, ''), 30),
         case when jsonb_typeof(t) = 'object' then nullif(t ->> 'minimo', '')::numeric end,
         case when jsonb_typeof(t) = 'object' then nullif(t ->> 'maximo', '')::numeric end
  from jsonb_array_elements(p -> 'tareas') with ordinality as x(t, n)
  where btrim(coalesce(case when jsonb_typeof(t) = 'string' then t #>> '{}' else t ->> 'texto' end, '')) <> '';
  insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
  select v_id, n, left(coalesce(r ->> 'componente', ''), 160), nullif(r ->> 'item_id', '')::uuid, left(coalesce(r ->> 'codigo', ''), 60),
         left(coalesce(r ->> 'descripcion', ''), 300), (r ->> 'cantidad')::numeric
  from jsonb_array_elements(coalesce(p -> 'repuestos', '[]')) with ordinality as x(r, n);
  perform public._paso_ot(v_id, 'Creó la OT correctiva');
  if v_asignado is not null then
    perform public._paso_ot(v_id, 'La asignó a ' || public._asignar_ot(v_id, array[v_asignado]));
  end if;
  perform set_config('app.cerrando_ot', 'off', true);
  return query select v_id, v_numero;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5) Terminar (el técnico): lo que cargó queda en la OT, que pasa "para revisar"; la rutina pasa a su fecha siguiente.
--    p: {fecha, observaciones, horas, causa, solucion, horas_parada, liberacion, tecnicos: [{usuario_id, fecha, inicio, fin}],
--        repuestos: [{componente, item_id, codigo, descripcion, cantidad, usado, precio}]}
-- ---------------------------------------------------------------------------------------------
create or replace function public._terminar_ot(p_ot uuid, p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_trabajo;
  r public.rutinas_preventivas;
  v_fecha date := coalesce((p ->> 'fecha')::date, public.hoy_local());
  v_horas numeric;
  v_siguiente bigint;
begin
  select * into o from public.ordenes_trabajo where id = p_ot for update;
  if not found then raise exception 'No se encontró la OT.'; end if;
  if o.estado = 'terminada' then raise exception 'La OT ya está terminada.'; end if;
  if v_fecha > public.hoy_local() then raise exception 'La fecha en que se hizo no puede ser posterior a hoy.'; end if;
  if o.tipo = 'correctiva' and btrim(coalesce(p ->> 'solucion', '')) = '' then raise exception 'Escribí el trabajo realizado.'; end if;

  -- los repuestos: lo previsto con lo que se usó de verdad (y lo que se agregó), con su precio de hoy
  delete from public.ot_repuestos where ot_id = o.id;
  insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad, usado, precio)
  select o.id, n, left(coalesce(x ->> 'componente', ''), 160), nullif(x ->> 'item_id', '')::uuid, left(coalesce(x ->> 'codigo', ''), 60),
         left(coalesce(x ->> 'descripcion', ''), 300), greatest(coalesce((x ->> 'cantidad')::numeric, 0), 0), greatest(coalesce((x ->> 'usado')::numeric, 0), 0),
         case when nullif(x ->> 'precio', '')::numeric >= 0 then (x ->> 'precio')::numeric end
  from jsonb_array_elements(coalesce(p -> 'repuestos', '[]')) with ordinality as y(x, n)
  where coalesce(x ->> 'item_id', '') <> '' or btrim(coalesce(x ->> 'codigo', '') || coalesce(x ->> 'descripcion', '')) <> '';

  -- los técnicos, con su horario (las horas de la OT son la suma de sus horas hombre, si se cargaron)
  delete from public.ot_tecnicos where ot_id = o.id;
  insert into public.ot_tecnicos (ot_id, orden, usuario_id, nombre, fecha, inicio, fin)
  select o.id, n, u.id, coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email),
         nullif(x ->> 'fecha', '')::date, nullif(x ->> 'inicio', '')::time, nullif(x ->> 'fin', '')::time
  from jsonb_array_elements(coalesce(p -> 'tecnicos', '[]')) with ordinality as y(x, n)
  join public.usuarios_perfil u on u.id = nullif(x ->> 'usuario_id', '')::uuid;
  select round(sum(extract(epoch from (fin - inicio + case when fin < inicio then interval '1 day' else interval '0' end)) / 3600)::numeric, 2)
    into v_horas from public.ot_tecnicos where ot_id = o.id and inicio is not null and fin is not null;
  v_horas := coalesce(v_horas, nullif(p ->> 'horas', '')::numeric);

  -- en las correctivas no se tilda OK / NO: el técnico redacta el trabajo realizado (lo pendiente va en las observaciones)
  if o.tipo = 'correctiva' then update public.ot_tareas set hecha = true where ot_id = o.id; end if;

  update public.ordenes_trabajo set estado = 'terminada', etapa = 'a_revisar', terminada_at = now(), fecha_cierre = v_fecha, horas = v_horas,
    observaciones = left(coalesce(p ->> 'observaciones', ''), 4000),
    causa = case when tipo = 'correctiva' then left(coalesce(p ->> 'causa', ''), 4000) else causa end,
    solucion = case when tipo = 'correctiva' then left(coalesce(p ->> 'solucion', ''), 4000) else solucion end,
    horas_parada = nullif(p ->> 'horas_parada', '')::numeric,
    liberacion = case when jsonb_typeof(p -> 'liberacion') = 'object' then p -> 'liberacion' end
  where id = o.id;

  -- la rutina pasa a su fecha siguiente, contada desde el día en que se hizo, y se arma su OT nueva
  if o.rutina_id is not null then
    update public.rutinas_preventivas set proxima_fecha = v_fecha + frecuencia_dias where id = o.rutina_id and activa returning * into r;
    if found then
      perform public._sincronizar_rutina(r.id);
      select numero into v_siguiente from public.ordenes_trabajo where rutina_id = r.id and estado <> 'terminada' order by created_at desc limit 1;
    end if;
  end if;
  return v_siguiente;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6) Aprobar (el responsable): recién ahí va al historial y se descuentan los repuestos; si se pide, las OT nuevas (van al jefe de taller).
--    p: {ot_pendientes (bool), ot_por_valores (bool), tareas_nuevas (texto, una tarea por renglón)}
-- ---------------------------------------------------------------------------------------------
create or replace function public._aprobar_ot(p_ot uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_trabajo;
  v_numero text;
  v_linea record;
  v_stock numeric;
  v_desc numeric;
  v_descontados integer := 0;
  v_faltantes integer := 0;
  v_hechas text[];
  v_sin_hacer text[];
  v_fuera text[];
  v_resumen text;
  v_intervencion uuid;
  v_pendientes bigint;
  v_por_valores bigint;
  v_a_mano bigint;
  v_nueva uuid;
  v_tareas text[];
begin
  select * into o from public.ordenes_trabajo where id = p_ot for update;
  if not found then raise exception 'No se encontró la OT.'; end if;
  if o.estado <> 'terminada' or o.etapa = 'aprobada' then raise exception 'La OT todavía no está terminada.'; end if;
  v_numero := 'OT-' || lpad(o.numero::text, 4, '0');

  -- se descuenta del Depósito solo lo que se usó; si no alcanza, lo que hay, y el resto queda como faltante (aviso para el Depósito)
  for v_linea in select id, item_id, usado from public.ot_repuestos where ot_id = o.id and item_id is not null and usado > 0 and descontado is null order by orden loop
    select coalesce(stock, 0) into v_stock from public.items where id = v_linea.item_id for no key update;
    v_desc := least(v_linea.usado, greatest(coalesce(v_stock, 0), 0));
    update public.ot_repuestos set descontado = v_desc, faltante = nullif(v_linea.usado - v_desc, 0) where id = v_linea.id;
    if v_desc > 0 then v_descontados := v_descontados + 1; end if;
    if v_linea.usado > v_desc then v_faltantes := v_faltantes + 1; end if;
  end loop;

  -- en el historial: qué se hizo, qué no y qué valores quedaron fuera de rango (en las correctivas, el trabajo realizado)
  select coalesce(array_agg(texto order by orden) filter (where hecha), '{}'), coalesce(array_agg(texto order by orden) filter (where not hecha), '{}'),
         coalesce(array_agg(format('%s %s %s', texto, public._numero_corto(valor), unidad) order by orden)
           filter (where mide and valor is not null and ((minimo is not null and valor < minimo) or (maximo is not null and valor > maximo))), '{}')
    into v_hechas, v_sin_hacer, v_fuera from public.ot_tareas where ot_id = o.id;
  v_resumen := case
    when o.tipo = 'correctiva' then coalesce(nullif(btrim(o.solucion), ''), nullif(btrim(o.falla), ''), nullif(array_to_string(v_hechas, '; '), ''), 'Trabajo realizado')
    when cardinality(v_hechas) + cardinality(v_sin_hacer) <= 1 and cardinality(v_sin_hacer) = 0 and cardinality(v_fuera) = 0 then coalesce(v_hechas[1], 'Trabajo realizado')
    else concat_ws(' ', format('%s de %s tareas OK.', cardinality(v_hechas), cardinality(v_hechas) + cardinality(v_sin_hacer)),
                   case when cardinality(v_sin_hacer) > 0 then 'En NO: ' || array_to_string(v_sin_hacer, '; ') || '.' end,
                   case when cardinality(v_fuera) > 0 then 'Fuera de rango: ' || btrim(array_to_string(v_fuera, '; ')) || '.' end)
  end;
  insert into public.equipo_intervenciones (equipo_id, fecha, tipo, descripcion, horas, prioridad, falla, causa, solucion, horas_parada, repuestos,
                                            creado_por, ot_id, ot_numero, revisado_por, aprobado_por)
  values (o.equipo_id, o.fecha_cierre, case when o.tipo = 'preventiva' then 'preventivo' else 'correctivo' end,
          left(v_numero || ': ' || v_resumen || coalesce(' — ' || nullif(btrim(o.observaciones), ''), ''), 4000), o.horas,
          case when o.tipo = 'correctiva' then coalesce(o.prioridad, 'normal') end,
          case when o.tipo = 'correctiva' then o.falla else '' end,
          case when o.tipo = 'correctiva' then o.causa else '' end,
          case when o.tipo = 'correctiva' then o.solucion else '' end,
          o.horas_parada,
          left(coalesce((select string_agg(concat(nullif(componente, '') || ': ', public._numero_corto(usado), ' × ', concat_ws(' ', nullif(codigo, ''), nullif(descripcion, ''))), '; ' order by orden)
                         from public.ot_repuestos where ot_id = o.id and usado > 0), ''), 2000),
          auth.uid(), o.id, v_numero,
          coalesce((select quien from public.ot_pasos where ot_id = o.id and accion like 'Revisó%' order by cuando desc limit 1), ''),
          coalesce((select coalesce(nullif(btrim(concat(u.nombre, ' ', u.apellido)), ''), u.email) from public.usuarios_perfil u where u.id = auth.uid()), ''))
  returning id into v_intervencion;
  insert into public.intervencion_tecnicos (intervencion_id, usuario_id, nombre, orden, fecha, inicio, fin)
  select v_intervencion, usuario_id, nombre, orden, fecha, inicio, fin from public.ot_tecnicos where ot_id = o.id;

  update public.ordenes_trabajo set etapa = 'aprobada' where id = o.id;

  -- las tareas que quedaron en NO, a una OT correctiva para el día siguiente (con sus mediciones y los repuestos previstos que no se usaron)
  if coalesce((p ->> 'ot_pendientes')::boolean, false) and cardinality(v_sin_hacer) > 0 and o.tipo = 'preventiva' then
    v_pendientes := public.siguiente_numero('OT');
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, prioridad, falla, observaciones, etapa, creado_por)
    values (v_pendientes, 'correctiva', o.equipo_id, public.hoy_local() + 1, coalesce(o.prioridad, 'normal'),
            left('Pendiente de la ' || v_numero || coalesce(': ' || nullif(o.falla, ''), ''), 4000), 'Tareas que quedaron pendientes de la ' || v_numero || '.',
            'por_asignar', auth.uid())
    returning id into v_nueva;
    insert into public.ot_tareas (ot_id, orden, texto, mide, unidad, minimo, maximo)
    select v_nueva, orden, texto, mide, unidad, minimo, maximo from public.ot_tareas where ot_id = o.id and not hecha order by orden;
    insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
    select v_nueva, orden, componente, item_id, codigo, descripcion, cantidad from public.ot_repuestos where ot_id = o.id and cantidad > 0 and coalesce(usado, 0) = 0;
    perform public._paso_ot(v_nueva, 'La generó al aprobar la ' || v_numero);
  end if;

  -- lo pendiente que escribe el responsable al aprobar (en las correctivas, lo pendiente va en las observaciones del técnico)
  select coalesce(array_agg(left(btrim(t), 500) order by n), '{}') into v_tareas
  from unnest(regexp_split_to_array(coalesce(p ->> 'tareas_nuevas', ''), E'\r?\n')) with ordinality as x(t, n) where btrim(t) <> '';
  if cardinality(v_tareas) > 0 then
    v_a_mano := public.siguiente_numero('OT');
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, prioridad, falla, observaciones, etapa, creado_por)
    values (v_a_mano, 'correctiva', o.equipo_id, public.hoy_local() + 1, coalesce(o.prioridad, 'normal'),
            left('Pendiente de la ' || v_numero || coalesce(': ' || nullif(o.falla, ''), ''), 4000),
            left('Pendiente de la ' || v_numero || coalesce(': ' || nullif(btrim(o.observaciones), ''), ''), 4000), 'por_asignar', auth.uid())
    returning id into v_nueva;
    insert into public.ot_tareas (ot_id, orden, texto) select v_nueva, n, t from unnest(v_tareas) with ordinality as x(t, n);
    perform public._paso_ot(v_nueva, 'La generó al aprobar la ' || v_numero);
  end if;

  -- los valores fuera de rango, a una OT correctiva para revisarlos: buscar la causa y, después de corregir, volver a medir
  if coalesce((p ->> 'ot_por_valores')::boolean, false) and cardinality(v_fuera) > 0 then
    v_por_valores := public.siguiente_numero('OT');
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, prioridad, falla, observaciones, etapa, creado_por)
    values (v_por_valores, 'correctiva', o.equipo_id, public.hoy_local() + 1, 'normal',
            left('Valores fuera de rango en la ' || v_numero || ': ' || btrim(array_to_string(v_fuera, '; ')), 4000),
            'Valores fuera de rango en la ' || v_numero || '.', 'por_asignar', auth.uid())
    returning id into v_nueva;
    insert into public.ot_tareas (ot_id, orden, texto, mide, unidad, minimo, maximo)
    select v_nueva, row_number() over (order by x.paso, x.orden), x.texto, x.mide, x.unidad, x.minimo, x.maximo
    from (
      select 1 as paso, orden, left(format('Buscar la causa — %s: %s %s', texto, public._numero_corto(valor), unidad), 500) as texto,
             false as mide, '' as unidad, null::numeric as minimo, null::numeric as maximo
      from public.ot_tareas where ot_id = o.id and mide and valor is not null and ((minimo is not null and valor < minimo) or (maximo is not null and valor > maximo))
      union all
      select 2, orden, left('Después de corregir: ' || texto, 500), true, unidad, minimo, maximo
      from public.ot_tareas where ot_id = o.id and mide and valor is not null and ((minimo is not null and valor < minimo) or (maximo is not null and valor > maximo))
    ) x;
    perform public._paso_ot(v_nueva, 'La generó al aprobar la ' || v_numero);
  end if;

  return jsonb_build_object('pendientes', v_pendientes, 'a_mano', v_a_mano, 'valores', v_por_valores, 'descontados', v_descontados, 'faltantes', v_faltantes);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 7) Los botones del circuito
-- ---------------------------------------------------------------------------------------------
-- El responsable deriva al jefe de taller las preventivas que le llegaron. Devuelve cuántas derivó.
create or replace function public.derivar_ots(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_cuantas integer := 0;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) then raise exception 'Solo el responsable de mantenimiento deriva las OT.'; end if;
  perform set_config('app.cerrando_ot', 'on', true);
  for v_id in update public.ordenes_trabajo set etapa = 'por_asignar' where id = any (coalesce(p_ids, '{}')) and etapa = 'por_derivar' returning id loop
    perform public._paso_ot(v_id, 'Derivó la OT al jefe de taller');
    v_cuantas := v_cuantas + 1;
  end loop;
  perform set_config('app.cerrando_ot', 'off', true);
  return v_cuantas;
end $$;

-- El jefe de taller asigna (o reasigna) la OT a uno o varios técnicos.
create or replace function public.asignar_ot(p_ot uuid, p_usuarios uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_trabajo;
  v_nombres text;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.jefe_de_taller()) then raise exception 'Solo el jefe de taller asigna las OT.'; end if;
  select * into o from public.ordenes_trabajo where id = p_ot for update;
  if not found then raise exception 'No se encontró la OT.'; end if;
  if o.estado = 'terminada' or o.etapa not in ('por_derivar', 'por_asignar', 'asignada') then raise exception 'Esa OT ya está terminada.'; end if;
  if o.etapa = 'por_derivar' and not (select public.administra_equipos()) then raise exception 'Primero la tiene que derivar el responsable.'; end if;
  perform set_config('app.cerrando_ot', 'on', true);
  v_nombres := public._asignar_ot(o.id, p_usuarios);
  perform public._paso_ot(o.id, case when o.etapa = 'asignada' then 'La reasignó a ' else 'La asignó a ' end || v_nombres);
  perform set_config('app.cerrando_ot', 'off', true);
end $$;

-- El técnico asignado termina la OT (también el jefe o el responsable, por si el técnico no tiene usuario). Devuelve el número de la siguiente.
create or replace function public.terminar_ot(p_ot uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_trabajo;
  v_siguiente bigint;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) then raise exception 'No tenés permiso para terminar órdenes de trabajo.'; end if;
  select * into o from public.ordenes_trabajo where id = p_ot;
  if not found then raise exception 'No se encontró la OT.'; end if;
  if o.estado = 'terminada' then raise exception 'La OT ya está terminada.'; end if;
  if o.etapa <> 'asignada' then raise exception 'Primero el jefe de taller tiene que asignarla.'; end if;
  if not exists (select 1 from public.ot_asignados where ot_id = o.id and usuario_id = auth.uid()) and not (select public.jefe_de_taller()) then
    raise exception 'La termina el técnico que la tiene asignada.';
  end if;
  perform set_config('app.cerrando_ot', 'on', true);
  v_siguiente := public._terminar_ot(o.id, p);
  perform public._paso_ot(o.id, 'Terminó la OT');
  perform set_config('app.cerrando_ot', 'off', true);
  return jsonb_build_object('siguiente', v_siguiente);
end $$;

-- El técnico carga una correctiva que ya hizo (llamado de guardia): nace terminada, para que la revise el jefe de taller.
-- p: {equipo_id, fecha, prioridad, falla, causa, solucion, horas, horas_parada, observaciones, liberacion, tecnicos, repuestos (usado = lo que se usó)}
create or replace function public.cargar_ot_correctiva(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_numero bigint;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) then raise exception 'No tenés permiso para cargar órdenes de trabajo.'; end if;
  if not exists (select 1 from public.equipos e where e.id = nullif(p ->> 'equipo_id', '')::uuid) then raise exception 'Elegí el equipo.'; end if;
  if btrim(coalesce(p ->> 'falla', '')) = '' then raise exception 'Contá cuál fue la falla.'; end if;
  if btrim(coalesce(p ->> 'solucion', '')) = '' then raise exception 'Escribí el trabajo realizado.'; end if;
  v_numero := public.siguiente_numero('OT');
  perform set_config('app.cerrando_ot', 'on', true);
  insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, prioridad, falla, etapa, creado_por)
  values (v_numero, 'correctiva', (p ->> 'equipo_id')::uuid, coalesce((p ->> 'fecha')::date, public.hoy_local()),
          case when p ->> 'prioridad' = 'urgente' then 'urgente' else 'normal' end, left(p ->> 'falla', 4000), 'asignada', auth.uid())
  returning id into v_id;
  perform public._asignar_ot(v_id, array[auth.uid()]);
  perform public._terminar_ot(v_id, p);
  perform public._paso_ot(v_id, 'Cargó la OT correctiva y la terminó');
  perform set_config('app.cerrando_ot', 'off', true);
  return v_numero;
end $$;

-- El jefe de taller la revisó: pasa al responsable para aprobar.
create or replace function public.pasar_ot_a_aprobacion(p_ot uuid, p_comentario text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.jefe_de_taller()) then raise exception 'Solo el jefe de taller revisa las OT.'; end if;
  perform set_config('app.cerrando_ot', 'on', true);
  update public.ordenes_trabajo set etapa = 'para_aprobar' where id = p_ot and etapa = 'a_revisar';
  if not found then raise exception 'Esa OT no está para revisar.'; end if;
  perform public._paso_ot(p_ot, 'Revisó la OT', p_comentario);
  perform set_config('app.cerrando_ot', 'off', true);
end $$;

-- El jefe (al revisar) o el responsable (al aprobar) la devuelven al técnico, con un comentario de qué tiene que corregir.
create or replace function public.devolver_ot(p_ot uuid, p_comentario text)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_trabajo;
begin
  perform public.exigir_modulo('mantenimiento');
  if btrim(coalesce(p_comentario, '')) = '' then raise exception 'Escribí qué tiene que corregir o completar.'; end if;
  select * into o from public.ordenes_trabajo where id = p_ot for update;
  if not found then raise exception 'No se encontró la OT.'; end if;
  if o.etapa = 'a_revisar' then
    if not (select public.jefe_de_taller()) then raise exception 'Solo el jefe de taller la devuelve al revisarla.'; end if;
  elsif o.etapa = 'para_aprobar' then
    if not (select public.administra_equipos()) then raise exception 'Solo el responsable la devuelve al aprobarla.'; end if;
  else
    raise exception 'Esa OT no está para revisar ni para aprobar.';
  end if;
  perform set_config('app.cerrando_ot', 'on', true);
  update public.ordenes_trabajo set etapa = 'asignada', estado = 'en_curso', terminada_at = null, fecha_cierre = null where id = o.id;
  perform public._paso_ot(o.id, 'Devolvió la OT al técnico', p_comentario);
  perform set_config('app.cerrando_ot', 'off', true);
end $$;

-- El responsable la aprueba: va al historial del equipo y se descuentan los repuestos.
create or replace function public.aprobar_ot(p_ot uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) then raise exception 'Solo el responsable de mantenimiento aprueba las OT.'; end if;
  if not exists (select 1 from public.ordenes_trabajo where id = p_ot and etapa = 'para_aprobar') then raise exception 'Esa OT no está para aprobar.'; end if;
  perform set_config('app.cerrando_ot', 'on', true);
  v := public._aprobar_ot(p_ot, coalesce(p, '{}'));
  perform public._paso_ot(p_ot, 'Aprobó la OT');
  perform set_config('app.cerrando_ot', 'off', true);
  return v;
end $$;

-- La de siempre (terminar y que quede en el historial en un solo paso), ahora solo para el responsable: termina y aprueba juntas.
create or replace function public.cerrar_ot(p_ot uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_siguiente bigint;
  v jsonb;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) then raise exception 'Solo el responsable de mantenimiento termina y aprueba una OT en un solo paso.'; end if;
  perform set_config('app.cerrando_ot', 'on', true);
  v_siguiente := public._terminar_ot(p_ot, p);
  v := public._aprobar_ot(p_ot, p);
  perform public._paso_ot(p_ot, 'Terminó y aprobó la OT');
  perform set_config('app.cerrando_ot', 'off', true);
  return v || jsonb_build_object('siguiente', v_siguiente);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array['public._paso_ot(uuid, text, text)', 'public._asignar_ot(uuid, uuid[])', 'public._terminar_ot(uuid, jsonb)', 'public._aprobar_ot(uuid, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.derivar_ots(uuid[])', 'public.asignar_ot(uuid, uuid[])', 'public.terminar_ot(uuid, jsonb)', 'public.cargar_ot_correctiva(jsonb)',
                           'public.pasar_ot_a_aprobacion(uuid, text)', 'public.devolver_ot(uuid, text)', 'public.aprobar_ot(uuid, jsonb)',
                           'public.crear_ot_correctiva(jsonb)', 'public.cerrar_ot(uuid, jsonb)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

select public._vinculos_por_empresa();
select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
