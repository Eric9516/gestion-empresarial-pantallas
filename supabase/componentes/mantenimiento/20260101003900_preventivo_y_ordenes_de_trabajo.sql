-- Mantenimiento, etapa 2: rutinas preventivas y órdenes de trabajo (OT). Diseño del encargado con el socio (ver docs/MANTENIMIENTO.md).
--
--   * Rutina preventiva: algo que se repite cada N días en un equipo (tareas, repuestos que lleva cada vez, responsable, días de aviso).
--   * Cada rutina activa tiene SIEMPRE una OT preventiva abierta para su próxima fecha: la arma la base (sincronizar_rutina), no la pantalla.
--   * OT correctiva: algo que se rompió o un trabajo de una vez (prioridad y falla reportada).
--   * Terminar una OT (cerrar_ot), todo junto o nada:
--       - queda en el historial del equipo (qué tareas se hicieron y cuáles no, técnicos con su horario, repuestos usados);
--       - se descuenta del Depósito SOLO lo que se usó. Si no alcanza, se descuenta lo que hay y la diferencia queda como aviso para el
--         Depósito (decisión del dueño, 04/11/2026: la OT se cierra igual y el stock nunca queda negativo);
--       - si es de una rutina, la rutina pasa a su fecha siguiente (contada desde el día en que se hizo) y se arma su OT nueva;
--       - opcional: lo que quedó sin hacer pasa a una OT correctiva nueva para el día siguiente.
-- Las tareas y los repuestos van en tablas propias (no en un texto con listas paralelas): editar una tarea no corre las marcas de otra.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------
-- 1) Rutinas preventivas
-- ---------------------------------------------------------------------------------------------
create table public.rutinas_preventivas (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos (id) on delete cascade,
  frecuencia_dias integer not null check (frecuencia_dias between 1 and 3650),
  proxima_fecha date not null,
  aviso_dias integer not null default 3 check (aviso_dias between 0 and 365),
  responsable_id uuid references public.usuarios_perfil (id) on delete set null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.rutina_tareas (
  id uuid primary key default gen_random_uuid(),
  rutina_id uuid not null references public.rutinas_preventivas (id) on delete cascade,
  orden smallint not null default 0,
  texto text not null check (length(btrim(texto)) between 1 and 500)
);
create table public.rutina_repuestos (
  id uuid primary key default gen_random_uuid(),
  rutina_id uuid not null references public.rutinas_preventivas (id) on delete cascade,
  orden smallint not null default 0,
  -- en qué parte del equipo va (un sub-equipo o algo escrito: "Motor lado acople")
  componente text not null default '' check (length(componente) <= 160),
  -- un repuesto del Depósito, o uno escrito a mano (que no descuenta stock)
  item_id uuid references public.items (id) on delete set null,
  codigo text not null default '' check (length(codigo) <= 60),
  descripcion text not null default '' check (length(descripcion) <= 300),
  cantidad numeric not null check (cantidad > 0 and cantidad <= 1000000)
);

-- ---------------------------------------------------------------------------------------------
-- 2) Órdenes de trabajo
-- ---------------------------------------------------------------------------------------------
create table public.ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  -- OT-0001, OT-0002… (correlativo de cada empresa, sin saltos)
  numero bigint not null,
  tipo text not null check (tipo in ('preventiva', 'correctiva')),
  equipo_id uuid not null references public.equipos (id) on delete cascade,
  rutina_id uuid references public.rutinas_preventivas (id) on delete set null,
  fecha_programada date not null,
  asignado_id uuid references public.usuarios_perfil (id) on delete set null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_curso', 'terminada')),
  -- cuándo tocaron "Empezar" (sirve de hora de inicio al terminar)
  empezada_at timestamptz,
  fecha_cierre date,
  observaciones text not null default '' check (length(observaciones) <= 4000),
  horas numeric check (horas >= 0 and horas <= 100000),
  -- solo en una correctiva
  prioridad text check (prioridad in ('normal', 'urgente')),
  falla text not null default '' check (length(falla) <= 4000),
  causa text not null default '' check (length(causa) <= 4000),
  solucion text not null default '' check (length(solucion) <= 4000),
  horas_parada numeric check (horas_parada >= 0 and horas_parada <= 100000),
  creado_por uuid references public.usuarios_perfil (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.ot_tareas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ordenes_trabajo (id) on delete cascade,
  orden smallint not null default 0,
  texto text not null check (length(btrim(texto)) between 1 and 500),
  hecha boolean not null default false
);
create table public.ot_repuestos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ordenes_trabajo (id) on delete cascade,
  orden smallint not null default 0,
  componente text not null default '' check (length(componente) <= 160),
  item_id uuid references public.items (id) on delete set null,
  codigo text not null default '' check (length(codigo) <= 60),
  descripcion text not null default '' check (length(descripcion) <= 300),
  -- lo previsto (0 = se agregó al terminar, no estaba previsto)
  cantidad numeric not null default 0 check (cantidad >= 0 and cantidad <= 1000000),
  -- al terminar: cuánto se usó de verdad (0 = no se cambió), cuánto se descontó del Depósito y cuánto faltó descontar
  usado numeric check (usado >= 0 and usado <= 1000000),
  descontado numeric check (descontado >= 0),
  faltante numeric check (faltante >= 0),
  -- el aviso del faltante, una vez que alguien del Depósito lo revisó
  faltante_revisado_por uuid references public.usuarios_perfil (id) on delete set null,
  faltante_revisado_at timestamptz
);
create table public.ot_tecnicos (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ordenes_trabajo (id) on delete cascade,
  orden smallint not null default 0,
  usuario_id uuid references public.usuarios_perfil (id) on delete set null,
  nombre text not null check (length(btrim(nombre)) between 1 and 160),
  -- fecha en que terminó y de qué hora a qué hora (las horas hombre se calculan)
  fecha date,
  inicio time,
  fin time
);

-- El historial sabe de qué OT salió cada trabajo (y su número queda aunque la OT se borre), y de cada técnico su horario.
alter table public.equipo_intervenciones
  add column if not exists ot_id uuid references public.ordenes_trabajo (id) on delete set null,
  add column if not exists ot_numero text;
alter table public.intervencion_tecnicos
  add column if not exists fecha date,
  add column if not exists inicio time,
  add column if not exists fin time;

select public._de_empresa(t::regclass) from unnest(array[
  'public.rutinas_preventivas', 'public.rutina_tareas', 'public.rutina_repuestos',
  'public.ordenes_trabajo', 'public.ot_tareas', 'public.ot_repuestos', 'public.ot_tecnicos'
]) as t;

create unique index ordenes_trabajo_numero_uidx on public.ordenes_trabajo (empresa_id, numero);
create index rutinas_preventivas_equipo_idx on public.rutinas_preventivas (empresa_id, equipo_id);
create index rutinas_preventivas_responsable_idx on public.rutinas_preventivas (empresa_id, responsable_id);
create index rutina_tareas_rutina_idx on public.rutina_tareas (empresa_id, rutina_id, orden);
create index rutina_repuestos_rutina_idx on public.rutina_repuestos (empresa_id, rutina_id, orden);
create index rutina_repuestos_item_idx on public.rutina_repuestos (empresa_id, item_id);
create index ordenes_trabajo_equipo_idx on public.ordenes_trabajo (empresa_id, equipo_id);
create index ordenes_trabajo_rutina_idx on public.ordenes_trabajo (empresa_id, rutina_id);
create index ordenes_trabajo_asignado_idx on public.ordenes_trabajo (empresa_id, asignado_id);
create index ordenes_trabajo_creado_por_idx on public.ordenes_trabajo (empresa_id, creado_por);
-- las abiertas (lo que más se consulta: avisos, calendario, mis OT)
create index ordenes_trabajo_abiertas_idx on public.ordenes_trabajo (empresa_id, fecha_programada) where estado <> 'terminada';
create index ordenes_trabajo_cierre_idx on public.ordenes_trabajo (empresa_id, fecha_cierre desc) where estado = 'terminada';
create index ot_tareas_ot_idx on public.ot_tareas (empresa_id, ot_id, orden);
create index ot_repuestos_ot_idx on public.ot_repuestos (empresa_id, ot_id, orden);
create index ot_repuestos_item_idx on public.ot_repuestos (empresa_id, item_id);
create index ot_repuestos_revisado_por_idx on public.ot_repuestos (empresa_id, faltante_revisado_por);
-- los faltantes que el Depósito todavía no revisó
create index ot_repuestos_faltantes_idx on public.ot_repuestos (empresa_id) where faltante > 0 and faltante_revisado_at is null;
create index ot_tecnicos_ot_idx on public.ot_tecnicos (empresa_id, ot_id, orden);
create index ot_tecnicos_usuario_idx on public.ot_tecnicos (empresa_id, usuario_id);
create index equipo_intervenciones_ot_idx on public.equipo_intervenciones (empresa_id, ot_id);

create trigger rutinas_preventivas_set_updated_at before update on public.rutinas_preventivas for each row execute function public.set_updated_at();
create trigger ordenes_trabajo_set_updated_at before update on public.ordenes_trabajo for each row execute function public.set_updated_at();

-- Una OT terminada ya no se cambia, y terminar una OT se hace solo con cerrar_ot (descuenta stock y anota el historial). Lo mismo para sus
-- tareas, repuestos y técnicos. Las funciones de abajo avisan con app.cerrando_ot que lo hacen ellas, y lo que hace la base en cascada (borrar
-- un equipo con sus OT, o una rutina) no pasa por acá (pg_trigger_depth() > 1).
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
  return new;
end $$;
create trigger trg_ordenes_trabajo_proteger before insert or update or delete on public.ordenes_trabajo
  for each row execute function public.ordenes_trabajo_proteger();

create or replace function public.ot_detalle_proteger()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.cerrando_ot', true), '') = 'on' or pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if exists (select 1 from public.ordenes_trabajo where id = coalesce(new.ot_id, old.ot_id) and estado = 'terminada') then
    raise exception 'La OT ya está terminada: no se puede cambiar.';
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_ot_tareas_proteger before insert or update or delete on public.ot_tareas for each row execute function public.ot_detalle_proteger();
create trigger trg_ot_repuestos_proteger before insert or update or delete on public.ot_repuestos for each row execute function public.ot_detalle_proteger();
create trigger trg_ot_tecnicos_proteger before insert or update or delete on public.ot_tecnicos for each row execute function public.ot_detalle_proteger();

-- ---------------------------------------------------------------------------------------------
-- 3) Quién ve y quién cambia cada cosa
-- ---------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['rutinas_preventivas', 'rutina_tareas', 'rutina_repuestos', 'ordenes_trabajo', 'ot_tareas', 'ot_repuestos', 'ot_tecnicos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.puede_ver_equipos()))', t || '_select', t);
    execute format('create policy bloqueo_modulo on public.%I as restrictive for all to public
                      using ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))
                      with check ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))', t);
    execute format('create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated
                      using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
  -- las rutinas: quien administra Mantenimiento
  foreach t in array array['rutinas_preventivas', 'rutina_tareas', 'rutina_repuestos'] loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.administra_equipos())) with check ((select public.administra_equipos()))', t || '_write', t);
  end loop;
  -- las OT abiertas las trabajan los técnicos (tildar tareas, empezar, cambiar la fecha o los repuestos previstos); se crean y se terminan
  -- con las funciones de abajo, y borrar una (solo correctivas abiertas) es de quien administra
  foreach t in array array['ot_tareas', 'ot_repuestos', 'ot_tecnicos'] loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.trabaja_en_equipos())) with check ((select public.trabaja_en_equipos()))', t || '_write', t);
  end loop;
  create policy ordenes_trabajo_update on public.ordenes_trabajo for update to authenticated
    using ((select public.trabaja_en_equipos())) with check ((select public.trabaja_en_equipos()));
  create policy ordenes_trabajo_delete on public.ordenes_trabajo for delete to authenticated
    using ((select public.administra_equipos()) and tipo = 'correctiva');
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4) La OT de cada rutina: siempre una abierta para su próxima fecha, al día con la rutina
-- ---------------------------------------------------------------------------------------------
-- Copia las tareas y los repuestos de la rutina a una OT (reemplaza los que tenía).
create or replace function public._copiar_rutina_a_ot(p_rutina uuid, p_ot uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.ot_tareas where ot_id = p_ot;
  insert into public.ot_tareas (ot_id, orden, texto) select p_ot, orden, texto from public.rutina_tareas where rutina_id = p_rutina order by orden;
  delete from public.ot_repuestos where ot_id = p_ot;
  insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
  select p_ot, orden, componente, item_id, codigo, descripcion, cantidad from public.rutina_repuestos where rutina_id = p_rutina order by orden;
end $$;

-- Sin permisos: la llaman las funciones de abajo, que ya los revisaron.
--   * rutina activa sin OT abierta: se arma la OT para su próxima fecha;
--   * con una OT pendiente (no empezada): se pone al día (fecha, responsable, tareas y repuestos; si cambiaron las tareas, se destildan);
--   * rutina desactivada o borrada: su OT pendiente se quita (una empezada queda).
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
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, rutina_id, fecha_programada, asignado_id, creado_por)
    values (public.siguiente_numero('OT'), 'preventiva', r.equipo_id, r.id, r.proxima_fecha, r.responsable_id, auth.uid())
    returning id into v_id;
    perform public._copiar_rutina_a_ot(r.id, v_id);
  elsif v_ot.estado = 'pendiente' then
    update public.ordenes_trabajo set fecha_programada = r.proxima_fecha, asignado_id = r.responsable_id, equipo_id = r.equipo_id where id = v_ot.id;
    -- las marcas se conservan solo si las tareas son las mismas
    if (select coalesce(array_agg(texto order by orden), '{}') from public.ot_tareas where ot_id = v_ot.id)
       is distinct from (select coalesce(array_agg(texto order by orden), '{}') from public.rutina_tareas where rutina_id = r.id)
    then
      delete from public.ot_tareas where ot_id = v_ot.id;
      insert into public.ot_tareas (ot_id, orden, texto) select v_ot.id, orden, texto from public.rutina_tareas where rutina_id = r.id order by orden;
    end if;
    delete from public.ot_repuestos where ot_id = v_ot.id;
    insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
    select v_ot.id, orden, componente, item_id, codigo, descripcion, cantidad from public.rutina_repuestos where rutina_id = r.id order by orden;
  end if;
  perform set_config('app.cerrando_ot', v_antes, true);
end $$;

-- Después de guardar o borrar una rutina (lo llama la app en la misma operación).
create or replace function public.sincronizar_rutina(p_rutina uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) then raise exception 'No tenés permiso para cambiar las rutinas.'; end if;
  perform public._sincronizar_rutina(p_rutina);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5) Crear una OT correctiva (con su número)
-- ---------------------------------------------------------------------------------------------
-- p: {equipo_id, fecha, asignado_id, prioridad, falla, tareas: [texto], repuestos: [{componente, item_id, codigo, descripcion, cantidad}]}
create or replace function public.crear_ot_correctiva(p jsonb)
returns table (id uuid, numero bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_numero bigint;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) then raise exception 'No tenés permiso para crear órdenes de trabajo.'; end if;
  if not exists (select 1 from public.equipos e where e.id = (p ->> 'equipo_id')::uuid) then raise exception 'Elegí el equipo.'; end if;
  if jsonb_array_length(coalesce(p -> 'tareas', '[]')) = 0 then raise exception 'Escribí qué hay que hacer.'; end if;
  v_numero := public.siguiente_numero('OT');
  insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, asignado_id, prioridad, falla, creado_por)
  values (v_numero, 'correctiva', (p ->> 'equipo_id')::uuid, coalesce((p ->> 'fecha')::date, public.hoy_local()), nullif(p ->> 'asignado_id', '')::uuid,
          case when p ->> 'prioridad' = 'urgente' then 'urgente' else 'normal' end, left(coalesce(p ->> 'falla', ''), 4000), auth.uid())
  returning ordenes_trabajo.id into v_id;
  insert into public.ot_tareas (ot_id, orden, texto)
  select v_id, n, left(btrim(t), 500) from jsonb_array_elements_text(p -> 'tareas') with ordinality as x(t, n) where btrim(t) <> '';
  insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
  select v_id, n, left(coalesce(r ->> 'componente', ''), 160), nullif(r ->> 'item_id', '')::uuid, left(coalesce(r ->> 'codigo', ''), 60),
         left(coalesce(r ->> 'descripcion', ''), 300), (r ->> 'cantidad')::numeric
  from jsonb_array_elements(coalesce(p -> 'repuestos', '[]')) with ordinality as x(r, n);
  return query select v_id, v_numero;
end $$;

-- Mover una OT abierta a otra fecha (por ejemplo, si no se pudo hacer ese día). Si es de una rutina, la rutina se mueve con ella: las
-- siguientes se cuentan desde que se haga. La puede mover un técnico (no cambia nada más de la rutina).
create or replace function public.reprogramar_ot(p_ot uuid, p_fecha date)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_trabajo;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) then raise exception 'No tenés permiso para cambiar órdenes de trabajo.'; end if;
  if p_fecha is null then raise exception 'Elegí la fecha.'; end if;
  select * into o from public.ordenes_trabajo where id = p_ot for update;
  if not found then raise exception 'No se encontró la OT.'; end if;
  if o.estado = 'terminada' then raise exception 'La OT ya está terminada.'; end if;
  update public.ordenes_trabajo set fecha_programada = p_fecha where id = o.id;
  if o.rutina_id is not null then update public.rutinas_preventivas set proxima_fecha = p_fecha where id = o.rutina_id; end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6) Terminar una OT
-- ---------------------------------------------------------------------------------------------
-- p: {fecha, observaciones, horas, causa, solucion, horas_parada, ot_pendientes (bool),
--     tecnicos: [{usuario_id, nombre, fecha, inicio, fin}],
--     repuestos: [{componente, item_id, codigo, descripcion, cantidad, usado}]}
-- Devuelve qué pasó: el número de la OT siguiente (rutina), el de la OT con lo pendiente, cuántos repuestos se descontaron y cuántos faltaron.
create or replace function public.cerrar_ot(p_ot uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.ordenes_trabajo;
  r public.rutinas_preventivas;
  e public.equipos;
  v_fecha date := coalesce((p ->> 'fecha')::date, public.hoy_local());
  v_numero text;
  v_linea record;
  v_stock numeric;
  v_desc numeric;
  v_descontados integer := 0;
  v_faltantes integer := 0;
  v_hechas text[];
  v_sin_hacer text[];
  v_resumen text;
  v_horas numeric;
  v_intervencion uuid;
  v_siguiente bigint;
  v_pendientes bigint;
  v_nueva uuid;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) then raise exception 'No tenés permiso para terminar órdenes de trabajo.'; end if;
  select * into o from public.ordenes_trabajo where id = p_ot for update;
  if not found then raise exception 'No se encontró la OT.'; end if;
  if o.estado = 'terminada' then raise exception 'La OT ya está terminada.'; end if;
  if v_fecha > public.hoy_local() then raise exception 'La fecha en que se hizo no puede ser posterior a hoy.'; end if;
  select * into e from public.equipos where id = o.equipo_id;
  v_numero := 'OT-' || lpad(o.numero::text, 4, '0');
  perform set_config('app.cerrando_ot', 'on', true);

  -- los repuestos: lo previsto con lo que se usó de verdad (y lo que se agregó)
  delete from public.ot_repuestos where ot_id = o.id;
  insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad, usado)
  select o.id, n, left(coalesce(x ->> 'componente', ''), 160), nullif(x ->> 'item_id', '')::uuid, left(coalesce(x ->> 'codigo', ''), 60),
         left(coalesce(x ->> 'descripcion', ''), 300), greatest(coalesce((x ->> 'cantidad')::numeric, 0), 0), greatest(coalesce((x ->> 'usado')::numeric, 0), 0)
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

  -- la OT queda terminada (antes de descontar: el descuento lo hace la base solo para una OT terminada)
  update public.ordenes_trabajo set estado = 'terminada', fecha_cierre = v_fecha, horas = v_horas,
    observaciones = left(coalesce(p ->> 'observaciones', ''), 4000),
    causa = case when tipo = 'correctiva' then left(coalesce(p ->> 'causa', ''), 4000) else causa end,
    solucion = case when tipo = 'correctiva' then left(coalesce(p ->> 'solucion', ''), 4000) else solucion end,
    horas_parada = case when tipo = 'correctiva' then nullif(p ->> 'horas_parada', '')::numeric else horas_parada end
  where id = o.id;

  -- se descuenta del Depósito solo lo que se usó; si no alcanza, lo que hay, y el resto queda como faltante (aviso para el Depósito).
  -- Lo descuenta ot_repuestos_descontar (abajo) al anotar el descontado, como los retiros: dentro de un disparador, con su movimiento de stock.
  for v_linea in select id, item_id, usado from public.ot_repuestos where ot_id = o.id and item_id is not null and usado > 0 order by orden loop
    select coalesce(stock, 0) into v_stock from public.items where id = v_linea.item_id for no key update;
    v_desc := least(v_linea.usado, greatest(coalesce(v_stock, 0), 0));
    update public.ot_repuestos set descontado = v_desc, faltante = nullif(v_linea.usado - v_desc, 0) where id = v_linea.id;
    if v_desc > 0 then v_descontados := v_descontados + 1; end if;
    if v_linea.usado > v_desc then v_faltantes := v_faltantes + 1; end if;
  end loop;

  -- en el historial: qué se hizo y qué no
  select coalesce(array_agg(texto order by orden) filter (where hecha), '{}'), coalesce(array_agg(texto order by orden) filter (where not hecha), '{}')
    into v_hechas, v_sin_hacer from public.ot_tareas where ot_id = o.id;
  v_resumen := case
    when cardinality(v_hechas) + cardinality(v_sin_hacer) <= 1 and cardinality(v_sin_hacer) = 0 then coalesce(v_hechas[1], 'Trabajo realizado')
    else concat_ws(' ', format('%s de %s tareas hechas.', cardinality(v_hechas), cardinality(v_hechas) + cardinality(v_sin_hacer)),
                   case when cardinality(v_sin_hacer) > 0 then 'Sin hacer: ' || array_to_string(v_sin_hacer, '; ') || '.' end)
  end;
  insert into public.equipo_intervenciones (equipo_id, fecha, tipo, descripcion, horas, prioridad, falla, causa, solucion, horas_parada, repuestos,
                                            creado_por, ot_id, ot_numero)
  values (o.equipo_id, v_fecha, case when o.tipo = 'preventiva' then 'preventivo' else 'correctivo' end,
          left(v_numero || ': ' || v_resumen || coalesce(' — ' || nullif(btrim(p ->> 'observaciones'), ''), ''), 4000), v_horas,
          case when o.tipo = 'correctiva' then coalesce(o.prioridad, 'normal') end,
          case when o.tipo = 'correctiva' then o.falla else '' end,
          case when o.tipo = 'correctiva' then left(coalesce(p ->> 'causa', ''), 4000) else '' end,
          case when o.tipo = 'correctiva' then left(coalesce(p ->> 'solucion', ''), 4000) else '' end,
          case when o.tipo = 'correctiva' then nullif(p ->> 'horas_parada', '')::numeric end,
          left(coalesce((select string_agg(concat(nullif(componente, '') || ': ', usado, ' × ', concat_ws(' ', nullif(codigo, ''), nullif(descripcion, ''))), '; ' order by orden)
                         from public.ot_repuestos where ot_id = o.id and usado > 0), ''), 2000),
          auth.uid(), o.id, v_numero)
  returning id into v_intervencion;
  insert into public.intervencion_tecnicos (intervencion_id, usuario_id, nombre, orden, fecha, inicio, fin)
  select v_intervencion, usuario_id, nombre, orden, fecha, inicio, fin from public.ot_tecnicos where ot_id = o.id;

  -- la rutina pasa a su fecha siguiente, contada desde el día en que se hizo, y se arma su OT nueva
  if o.rutina_id is not null then
    update public.rutinas_preventivas set proxima_fecha = v_fecha + frecuencia_dias where id = o.rutina_id and activa returning * into r;
    if found then
      perform public._sincronizar_rutina(r.id);
      select numero into v_siguiente from public.ordenes_trabajo where rutina_id = r.id and estado <> 'terminada' order by created_at desc limit 1;
    end if;
  end if;

  -- lo que quedó sin hacer, a una OT correctiva para el día siguiente (con los repuestos previstos que no se usaron)
  if coalesce((p ->> 'ot_pendientes')::boolean, false) and cardinality(v_sin_hacer) > 0 then
    v_pendientes := public.siguiente_numero('OT');
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, asignado_id, prioridad, falla, observaciones, creado_por)
    values (v_pendientes, 'correctiva', o.equipo_id, v_fecha + 1, o.asignado_id, coalesce(o.prioridad, 'normal'),
            left('Pendiente de la ' || v_numero || coalesce(': ' || nullif(o.falla, ''), ''), 4000), 'Tareas que quedaron pendientes de la ' || v_numero || '.', auth.uid())
    returning id into v_nueva;
    insert into public.ot_tareas (ot_id, orden, texto) select v_nueva, n, t from unnest(v_sin_hacer) with ordinality as x(t, n);
    insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
    select v_nueva, orden, componente, item_id, codigo, descripcion, cantidad from public.ot_repuestos where ot_id = o.id and cantidad > 0 and coalesce(usado, 0) = 0;
  end if;

  perform set_config('app.cerrando_ot', 'off', true);
  return jsonb_build_object('siguiente', v_siguiente, 'pendientes', v_pendientes, 'descontados', v_descontados, 'faltantes', v_faltantes);
end $$;

-- Al anotar cuánto se descontó de un repuesto de una OT terminada, sale del Depósito (un movimiento "mantenimiento" con el número de la OT
-- y el equipo). Es un disparador, como el de los retiros: así lo puede hacer un técnico que no administra el Depósito, y solo pasa una vez
-- por línea (después la OT terminada ya no se puede cambiar).
create or replace function public.ot_repuestos_descontar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_detalle text;
begin
  if new.item_id is null or coalesce(new.descontado, 0) <= 0 or old.descontado is not null then return new; end if;
  select left(format('OT-%s · %s %s', lpad(o.numero::text, 4, '0'), e.codigo, e.nombre), 300) into v_detalle
  from public.ordenes_trabajo o join public.equipos e on e.id = o.equipo_id where o.id = new.ot_id and o.estado = 'terminada';
  if v_detalle is null then raise exception 'Los repuestos se descuentan al terminar la OT.'; end if;
  perform public.mover_stock(new.item_id, -new.descontado, 'mantenimiento', v_detalle, 'ordenes_trabajo', new.ot_id);
  return new;
end $$;
create trigger trg_ot_repuestos_descontar after update of descontado on public.ot_repuestos
  for each row execute function public.ot_repuestos_descontar();

-- ---------------------------------------------------------------------------------------------
-- 7) El stock de los repuestos para quien ve Mantenimiento (aunque no tenga el Depósito), y buscarlos para quien trabaja en él
-- ---------------------------------------------------------------------------------------------
create or replace function public.stock_de_repuestos(p_items uuid[])
returns table (id uuid, codigo text, descripcion text, stock numeric, ubicacion text, deposito text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.puede_ver_equipos()) then return; end if;
  return query select i.id, i.codigo, i.descripcion, i.stock, i.ubicacion, d.nombre
    from public.items i left join public.depositos d on d.id = i.deposito_id where i.id = any (p_items);
end $$;

-- Los técnicos también eligen repuestos (al crear una OT correctiva o al terminarla).
create or replace function public.repuestos_para_equipos(p_texto text, p_limite integer default 8)
returns table (id uuid, codigo text, descripcion text, stock numeric, deposito text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_palabras text[] := array(
    select replace(replace(replace(x, '\', '\\'), '%', '\%'), '_', '\_')
    from regexp_split_to_table(public.texto_de_busqueda(btrim(coalesce(p_texto, ''))), '\s+') x where x <> '' limit 8);
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.trabaja_en_equipos()) or cardinality(v_palabras) = 0 then return; end if;
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

-- ---------------------------------------------------------------------------------------------
-- 8) Los faltantes, para el Depósito: lo que una OT usó y no se pudo descontar (no había stock). Los ve quien tiene ese depósito; los da
--    por revisados quien lo administra.
-- ---------------------------------------------------------------------------------------------
create or replace function public.faltantes_de_mantenimiento()
returns table (id uuid, ot text, fecha date, equipo text, item_id uuid, codigo text, descripcion text, faltante numeric, deposito_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (select public.modulo_activo('mantenimiento')) or not (select public.tiene_acceso_mantenimiento()) then return; end if;
  return query
    select r.id, 'OT-' || lpad(o.numero::text, 4, '0'), o.fecha_cierre, e.codigo || ' — ' || e.nombre, i.id, i.codigo, i.descripcion, r.faltante, i.deposito_id
    from public.ot_repuestos r
    join public.ordenes_trabajo o on o.id = r.ot_id
    join public.equipos e on e.id = o.equipo_id
    join public.items i on i.id = r.item_id
    where r.faltante > 0 and r.faltante_revisado_at is null and i.deposito_id in (select public.depositos_del_usuario())
    order by o.fecha_cierre desc, o.numero desc;
end $$;

create or replace function public.revisar_faltante(p_linea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.is_mantenimiento_admin()) then raise exception 'Solo quien administra el Depósito puede darlo por revisado.'; end if;
  perform set_config('app.cerrando_ot', 'on', true);
  update public.ot_repuestos r set faltante_revisado_por = auth.uid(), faltante_revisado_at = now()
  where r.id = p_linea and r.faltante > 0 and r.faltante_revisado_at is null
    and exists (select 1 from public.items i where i.id = r.item_id and i.deposito_id in (select public.depositos_del_usuario()));
  if not found then raise exception 'No se encontró el faltante.'; end if;
  perform set_config('app.cerrando_ot', 'off', true);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array['public._copiar_rutina_a_ot(uuid, uuid)', 'public._sincronizar_rutina(uuid)', 'public.ot_repuestos_descontar()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.sincronizar_rutina(uuid)', 'public.crear_ot_correctiva(jsonb)', 'public.cerrar_ot(uuid, jsonb)',
                           'public.stock_de_repuestos(uuid[])', 'public.repuestos_para_equipos(text, integer)', 'public.faltantes_de_mantenimiento()',
                           'public.revisar_faltante(uuid)', 'public.reprogramar_ot(uuid, date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

select public._vinculos_por_empresa();
select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
