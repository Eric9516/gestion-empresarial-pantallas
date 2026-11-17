-- Mantenimiento, etapa 3: planillas de tareas, mediciones, liberación del equipo y formato de la OT (diseño del encargado con el socio).
--
--   * Planillas de tareas: listas armadas de antemano ("Bomba centrífuga – mensual"). Una rutina puede tomar sus tareas de una planilla:
--     si la planilla cambia, se actualizan todas las rutinas que la usan y sus OT pendientes (aplicar_planilla). Si se borra, las rutinas
--     se quedan con una copia de sus tareas.
--   * Mediciones: una tarea puede pedir un valor (unidad y rango normal opcional, ej.: vibración de 0 a 4,5 mm/s). En la OT se anota el
--     número; fuera de rango se marca. Al terminar se puede crear una OT correctiva para revisarlo.
--   * Liberación del equipo al terminar la OT: controles de entrega (limpieza, sanitización…) y quién lo recibe.
--   * Formato de la OT (uno por empresa, lo elige quien administra): código, versión y vigencia del registro de calidad que sale en la OT
--     impresa, y los controles de la liberación (vacío = sin liberación).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------
-- 1) Planillas de tareas
-- ---------------------------------------------------------------------------------------------
create table public.planillas_tareas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 160),
  notas text not null default '' check (length(notas) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.planilla_tareas_items (
  id uuid primary key default gen_random_uuid(),
  planilla_id uuid not null references public.planillas_tareas (id) on delete cascade,
  orden smallint not null default 0,
  texto text not null check (length(btrim(texto)) between 1 and 500),
  -- si hay que anotar un valor: su unidad y su rango normal (los dos límites son opcionales)
  mide boolean not null default false,
  unidad text not null default '' check (length(unidad) <= 30),
  minimo numeric,
  maximo numeric,
  check (minimo is null or maximo is null or minimo <= maximo)
);

-- Las tareas de las rutinas y de las OT también pueden ser mediciones; en la OT, con el valor anotado.
alter table public.rutina_tareas
  add column if not exists mide boolean not null default false,
  add column if not exists unidad text not null default '' check (length(unidad) <= 30),
  add column if not exists minimo numeric,
  add column if not exists maximo numeric;
alter table public.ot_tareas
  add column if not exists mide boolean not null default false,
  add column if not exists unidad text not null default '' check (length(unidad) <= 30),
  add column if not exists minimo numeric,
  add column if not exists maximo numeric,
  add column if not exists valor numeric check (valor is null or abs(valor) < 1e12);
alter table public.rutinas_preventivas add column if not exists planilla_id uuid references public.planillas_tareas (id) on delete set null;
-- la liberación del equipo de una OT terminada: {controles: [{texto, ok}], recibio}
alter table public.ordenes_trabajo add column if not exists liberacion jsonb check (liberacion is null or length(liberacion::text) <= 20000);

-- ---------------------------------------------------------------------------------------------
-- 2) Formato de la OT (una fila por empresa)
-- ---------------------------------------------------------------------------------------------
create table public.mantenimiento_config (
  id smallint not null default 1,
  registro_codigo text not null default '' check (length(registro_codigo) <= 60),
  registro_version text not null default '' check (length(registro_version) <= 30),
  registro_vigencia date,
  controles_liberacion text[] not null default array['Sin objetos extraños', 'Limpieza', 'Sanitización', 'Prueba en vacío', 'Retiro de herramientas'],
  recibe_liberacion text not null default 'Responsable de Producción' check (length(recibe_liberacion) <= 120),
  updated_at timestamptz not null default now()
);

select public._de_empresa(t::regclass) from unnest(array['public.planillas_tareas', 'public.planilla_tareas_items', 'public.mantenimiento_config']) as t;
alter table public.mantenimiento_config add constraint mantenimiento_config_pkey primary key (empresa_id);
create unique index planillas_tareas_nombre_uidx on public.planillas_tareas (empresa_id, public.texto_de_busqueda(btrim(nombre)));
create index planilla_tareas_items_planilla_idx on public.planilla_tareas_items (empresa_id, planilla_id, orden);
create index rutinas_preventivas_planilla_idx on public.rutinas_preventivas (empresa_id, planilla_id);
create trigger planillas_tareas_set_updated_at before update on public.planillas_tareas for each row execute function public.set_updated_at();
create trigger mantenimiento_config_set_updated_at before update on public.mantenimiento_config for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['planillas_tareas', 'planilla_tareas_items', 'mantenimiento_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.puede_ver_equipos()))', t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.administra_equipos())) with check ((select public.administra_equipos()))', t || '_write', t);
    execute format('create policy bloqueo_modulo on public.%I as restrictive for all to public
                      using ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))
                      with check ((select public.modulo_activo(''mantenimiento'')) and (select public.modulo_activo(''deposito'')))', t);
    execute format('create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated
                      using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3) La OT de cada rutina copia también las mediciones (reemplaza las versiones de la etapa 2)
-- ---------------------------------------------------------------------------------------------
create or replace function public._copiar_rutina_a_ot(p_rutina uuid, p_ot uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.ot_tareas where ot_id = p_ot;
  insert into public.ot_tareas (ot_id, orden, texto, mide, unidad, minimo, maximo)
  select p_ot, orden, texto, mide, unidad, minimo, maximo from public.rutina_tareas where rutina_id = p_rutina order by orden;
  delete from public.ot_repuestos where ot_id = p_ot;
  insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
  select p_ot, orden, componente, item_id, codigo, descripcion, cantidad from public.rutina_repuestos where rutina_id = p_rutina order by orden;
end $$;

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

-- Después de guardar una planilla: las rutinas que la usan toman sus tareas, y sus OT pendientes se ponen al día.
create or replace function public.aplicar_planilla(p_planilla uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_rutina uuid;
  v_cuantas integer := 0;
begin
  perform public.exigir_modulo('mantenimiento');
  if not (select public.administra_equipos()) then raise exception 'No tenés permiso para cambiar las planillas.'; end if;
  for v_rutina in select id from public.rutinas_preventivas where planilla_id = p_planilla loop
    delete from public.rutina_tareas where rutina_id = v_rutina;
    insert into public.rutina_tareas (rutina_id, orden, texto, mide, unidad, minimo, maximo)
    select v_rutina, orden, texto, mide, unidad, minimo, maximo from public.planilla_tareas_items where planilla_id = p_planilla order by orden;
    perform public._sincronizar_rutina(v_rutina);
    v_cuantas := v_cuantas + 1;
  end loop;
  return v_cuantas;
end $$;

-- Una OT correctiva: cada tarea puede ser un texto o {texto, mide, unidad, minimo, maximo}.
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
  return query select v_id, v_numero;
end $$;

-- Un número para leer: 4,5 (sin ceros de más).
create or replace function public._numero_corto(p numeric)
returns text language sql immutable set search_path = public as $$ select replace(trim_scale(p)::text, '.', ',') $$;

-- ---------------------------------------------------------------------------------------------
-- 4) Terminar una OT: además, la liberación del equipo, los valores fuera de rango en el historial y, si se pide, una OT para revisarlos
-- ---------------------------------------------------------------------------------------------
-- p: lo de la etapa 2 más {liberacion: {controles: [{texto, ok}], recibio}, ot_por_valores (bool)}
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
  v_fuera text[];
  v_resumen text;
  v_horas numeric;
  v_intervencion uuid;
  v_siguiente bigint;
  v_pendientes bigint;
  v_por_valores bigint;
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
    horas_parada = case when tipo = 'correctiva' then nullif(p ->> 'horas_parada', '')::numeric else horas_parada end,
    liberacion = case when jsonb_typeof(p -> 'liberacion') = 'object' then p -> 'liberacion' end
  where id = o.id;

  -- se descuenta del Depósito solo lo que se usó; si no alcanza, lo que hay, y el resto queda como faltante (aviso para el Depósito).
  for v_linea in select id, item_id, usado from public.ot_repuestos where ot_id = o.id and item_id is not null and usado > 0 order by orden loop
    select coalesce(stock, 0) into v_stock from public.items where id = v_linea.item_id for no key update;
    v_desc := least(v_linea.usado, greatest(coalesce(v_stock, 0), 0));
    update public.ot_repuestos set descontado = v_desc, faltante = nullif(v_linea.usado - v_desc, 0) where id = v_linea.id;
    if v_desc > 0 then v_descontados := v_descontados + 1; end if;
    if v_linea.usado > v_desc then v_faltantes := v_faltantes + 1; end if;
  end loop;

  -- en el historial: qué se hizo, qué no y qué valores quedaron fuera de rango
  select coalesce(array_agg(texto order by orden) filter (where hecha), '{}'), coalesce(array_agg(texto order by orden) filter (where not hecha), '{}'),
         coalesce(array_agg(format('%s %s %s', texto, public._numero_corto(valor), unidad) order by orden)
           filter (where mide and valor is not null and ((minimo is not null and valor < minimo) or (maximo is not null and valor > maximo))), '{}')
    into v_hechas, v_sin_hacer, v_fuera from public.ot_tareas where ot_id = o.id;
  v_resumen := case
    when cardinality(v_hechas) + cardinality(v_sin_hacer) <= 1 and cardinality(v_sin_hacer) = 0 and cardinality(v_fuera) = 0 then coalesce(v_hechas[1], 'Trabajo realizado')
    else concat_ws(' ', format('%s de %s tareas hechas.', cardinality(v_hechas), cardinality(v_hechas) + cardinality(v_sin_hacer)),
                   case when cardinality(v_sin_hacer) > 0 then 'Sin hacer: ' || array_to_string(v_sin_hacer, '; ') || '.' end,
                   case when cardinality(v_fuera) > 0 then 'Fuera de rango: ' || btrim(array_to_string(v_fuera, '; ')) || '.' end)
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
          left(coalesce((select string_agg(concat(nullif(componente, '') || ': ', public._numero_corto(usado), ' × ', concat_ws(' ', nullif(codigo, ''), nullif(descripcion, ''))), '; ' order by orden)
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

  -- lo que quedó sin hacer, a una OT correctiva para el día siguiente (con sus mediciones y los repuestos previstos que no se usaron)
  if coalesce((p ->> 'ot_pendientes')::boolean, false) and cardinality(v_sin_hacer) > 0 then
    v_pendientes := public.siguiente_numero('OT');
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, asignado_id, prioridad, falla, observaciones, creado_por)
    values (v_pendientes, 'correctiva', o.equipo_id, v_fecha + 1, o.asignado_id, coalesce(o.prioridad, 'normal'),
            left('Pendiente de la ' || v_numero || coalesce(': ' || nullif(o.falla, ''), ''), 4000), 'Tareas que quedaron pendientes de la ' || v_numero || '.', auth.uid())
    returning id into v_nueva;
    insert into public.ot_tareas (ot_id, orden, texto, mide, unidad, minimo, maximo)
    select v_nueva, orden, texto, mide, unidad, minimo, maximo from public.ot_tareas where ot_id = o.id and not hecha order by orden;
    insert into public.ot_repuestos (ot_id, orden, componente, item_id, codigo, descripcion, cantidad)
    select v_nueva, orden, componente, item_id, codigo, descripcion, cantidad from public.ot_repuestos where ot_id = o.id and cantidad > 0 and coalesce(usado, 0) = 0;
  end if;

  -- los valores fuera de rango, a una OT correctiva para revisarlos: buscar la causa y, después de corregir, volver a medir
  if coalesce((p ->> 'ot_por_valores')::boolean, false) and cardinality(v_fuera) > 0 then
    v_por_valores := public.siguiente_numero('OT');
    insert into public.ordenes_trabajo (numero, tipo, equipo_id, fecha_programada, asignado_id, prioridad, falla, observaciones, creado_por)
    values (v_por_valores, 'correctiva', o.equipo_id, v_fecha + 1, o.asignado_id, 'normal',
            left('Valores fuera de rango en la ' || v_numero || ': ' || btrim(array_to_string(v_fuera, '; ')), 4000),
            'Valores fuera de rango en la ' || v_numero || '.', auth.uid())
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
  end if;

  perform set_config('app.cerrando_ot', 'off', true);
  return jsonb_build_object('siguiente', v_siguiente, 'pendientes', v_pendientes, 'valores', v_por_valores, 'descontados', v_descontados, 'faltantes', v_faltantes);
end $$;

do $$
declare
  f text;
begin
  foreach f in array array['public._copiar_rutina_a_ot(uuid, uuid)', 'public._sincronizar_rutina(uuid)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['public.aplicar_planilla(uuid)', 'public.crear_ot_correctiva(jsonb)', 'public.cerrar_ot(uuid, jsonb)', 'public._numero_corto(numeric)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

select public._vinculos_por_empresa();
select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
