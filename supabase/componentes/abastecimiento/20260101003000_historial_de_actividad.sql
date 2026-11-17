-- Historial de actividad: qué se hizo, quién, cuándo y en qué depósito, listo para filtrar y descargar (Configuración → Historial).
--
-- Cada cambio del historial (audit_log) y cada movimiento de stock (movimientos_stock) deja una fila en "actividad", ya redactada para leer:
--   "Stock 1 → 0 (retiro, sector Secado)", "Punto de pedido 0 → 1 · Stock mínimo 0 → 2", "Alta del repuesto".
-- Solo se anota lo que cambió. El stock sale de los movimientos (que dicen si fue carga, ajuste, retiro o importación), así que los cambios
-- de stock del historial de repuestos no se repiten. La tabla se llena sola (disparadores) y se lee de a páginas por sus índices:
-- aunque se acumulen años, cada página sale en milisegundos y cargar stock no se hace más lento.
--
-- Quién ve qué (lo hace cumplir la base): el dueño, todo; quien tenga el permiso "Ver auditoría", lo de sus depósitos y el Directorio
-- (no los cambios de usuarios ni de configuración); nadie más. La tabla no se lee directo: solo con las funciones de abajo.

create table if not exists public.actividad (
  id bigint generated always as identity primary key,
  momento timestamptz not null,
  usuario_id uuid,
  usuario_nombre text,
  -- sobre qué fue: un repuesto (con su stock), una reparación, el Directorio, un usuario o la configuración
  sobre text not null check (sobre in ('repuesto', 'reparacion', 'proveedor', 'comisionista', 'contacto', 'usuario', 'configuracion')),
  -- lo que agrupa las filas en el informe (el repuesto, el proveedor…)
  registro_id text,
  codigo text,
  titulo text not null default '',
  -- sin referencia: el historial de un depósito que se borre no se pierde
  deposito_id uuid,
  accion text not null check (accion in ('alta', 'carga', 'salida', 'modificacion', 'eliminacion')),
  detalle text not null default '',
  -- código, nombre y detalle sin tildes ni mayúsculas, para buscar
  busqueda text not null default ''
);

alter table public.actividad enable row level security;
revoke all on public.actividad from public, anon, authenticated;
create policy requiere_usuario_activo on public.actividad as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

create index if not exists actividad_momento_idx on public.actividad (momento desc, id desc);
create index if not exists actividad_usuario_idx on public.actividad (usuario_id, momento desc, id desc);
create index if not exists actividad_deposito_idx on public.actividad (deposito_id, momento desc, id desc);
create index if not exists actividad_sobre_idx on public.actividad (sobre, momento desc, id desc);
create index if not exists actividad_accion_idx on public.actividad (accion, momento desc, id desc);
-- "qué retiró tal persona": persona y tipo de movimiento juntos
create index if not exists actividad_usuario_accion_idx on public.actividad (usuario_id, accion, momento desc, id desc);
create index if not exists actividad_busqueda_idx on public.actividad using gin (busqueda gin_trgm_ops);

-- "punto de pedido 0 → 1" → "Punto de pedido 0 → 1"
create or replace function public._actividad_mayuscula(p text)
returns text language sql immutable set search_path = public as $$
  select upper(left(p, 1)) || substr(p, 2);
$$;

-- Un valor de una fila guardada (jsonb) para leer: sí/no, el texto o el número.
create or replace function public._actividad_valor(p jsonb)
returns text language sql immutable set search_path = public as $$
  select case jsonb_typeof(p) when 'boolean' then case when p::text = 'true' then 'sí' else 'no' end when 'null' then null else p #>> '{}' end;
$$;

-- Los campos que cambiaron entre dos versiones de una fila (proveedores, comisionistas, contactos): "Teléfono 351… → 351… · Rubro …".
-- Los identificadores y las fechas internas no se muestran; lo que es una lista o un grupo de datos se anota como "modificado".
create or replace function public._actividad_diferencias(p_antes jsonb, p_despues jsonb)
returns text language sql immutable set search_path = public as $$
  select string_agg(
           public._actividad_mayuscula(replace(k, '_', ' ')) || ' ' ||
           case when jsonb_typeof(coalesce(p_despues -> k, p_antes -> k)) in ('object', 'array') then 'modificado'
                else coalesce(nullif(left(public._actividad_valor(p_antes -> k), 60), ''), '—') || ' → ' ||
                     coalesce(nullif(left(public._actividad_valor(p_despues -> k), 60), ''), '—') end,
           ' · ' order by k)
  from jsonb_object_keys(coalesce(p_despues, '{}'::jsonb)) as k
  where k not in ('id', 'created_at', 'updated_at') and k not like '%\_id' and k not like '%\_por'
    and (p_antes -> k) is distinct from (p_despues -> k);
$$;

-- Los cambios que el historial ya escribió ("…· stock mínimo 0 → 2; punto de pedido 0 → 1"), en una lista.
create or replace function public._actividad_partes(p_texto text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(btrim(p) order by n), '{}') from unnest(string_to_array(p_texto, '; ')) with ordinality as t(p, n) where btrim(p) <> '';
$$;

revoke execute on function public._actividad_mayuscula(text), public._actividad_valor(jsonb), public._actividad_diferencias(jsonb, jsonb), public._actividad_partes(text) from public, anon, authenticated;

-- Anota en "actividad" un cambio del historial.
create or replace function public._actividad_registrar_auditoria(a public.audit_log)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d jsonb := coalesce(a.datos_nuevos, a.datos_anteriores, '{}'::jsonb);
  v_sobre text;
  v_accion text := case a.accion when 'insert' then 'alta' when 'delete' then 'eliminacion' else 'modificacion' end;
  v_registro text := a.registro_id;
  v_codigo text;
  v_titulo text := '';
  v_dep uuid;
  v_detalle text;
  v_prefijo text;
  v_partes text[];
  v_item record;
begin
  if a.tabla = 'items' then
    v_sobre := 'repuesto';
    v_codigo := d ->> 'codigo';
    v_titulo := coalesce(d ->> 'descripcion', '');
    v_dep := (d ->> 'deposito_id')::uuid;
    if a.accion = 'insert' then
      v_detalle := 'Alta del repuesto';
    elsif a.accion = 'delete' then
      v_detalle := 'Baja definitiva del repuesto';
    else
      -- lo que cambió, sin el stock (eso lo cuentan los movimientos, con su motivo)
      v_prefijo := concat(d ->> 'codigo', ' — ', left(coalesce(d ->> 'descripcion', ''), 60), ' · ');
      v_partes := array(
        select p from unnest(public._actividad_partes(case when starts_with(coalesce(a.descripcion, ''), v_prefijo)
                                                            then substr(a.descripcion, length(v_prefijo) + 1) else a.descripcion end)) with ordinality as t(p, n)
        where p !~ '^stock (—|-?[0-9])' order by n);
      if cardinality(v_partes) = 0 then return; end if;
      if 'enviado a la papelera' = any(v_partes) then v_accion := 'eliminacion'; end if;
      v_detalle := (select string_agg(public._actividad_mayuscula(p), ' · ' order by n) from unnest(v_partes) with ordinality as t(p, n));
    end if;

  elsif a.tabla = 'usuarios_perfil' then
    v_sobre := 'usuario';
    v_titulo := split_part(coalesce(a.descripcion, ''), ' · ', 1);
    if a.accion = 'insert' then
      v_detalle := 'Alta del usuario';
    elsif a.accion = 'delete' then
      v_detalle := 'Baja del usuario';
    else
      v_partes := public._actividad_partes(substr(a.descripcion, length(v_titulo) + 4));
      if cardinality(v_partes) = 0 then return; end if;
      v_detalle := (select string_agg(public._actividad_mayuscula(p), ' · ' order by n) from unnest(v_partes) with ordinality as t(p, n));
    end if;

  elsif a.tabla in ('proveedores', 'comisionistas', 'contactos') then
    v_sobre := case a.tabla when 'proveedores' then 'proveedor' when 'comisionistas' then 'comisionista' else 'contacto' end;
    v_titulo := coalesce(nullif(a.descripcion, ''), d ->> 'nombre', '');
    if a.accion = 'insert' then
      v_detalle := 'Alta';
    elsif a.accion = 'delete' then
      v_detalle := 'Baja';
    else
      v_detalle := public._actividad_diferencias(a.datos_anteriores, a.datos_nuevos);
      if v_detalle is null then return; end if;
    end if;

  elsif a.tabla in ('reparaciones', 'reparacion_items', 'reparacion_entregas') then
    v_sobre := 'reparacion';
    v_registro := case when a.tabla = 'reparaciones' then a.registro_id else d ->> 'reparacion_id' end;
    v_titulo := coalesce((select r.motivo from public.reparaciones r where r.id::text = v_registro), case when a.tabla = 'reparaciones' then d ->> 'motivo' end, 'Reparación');
    if d ? 'item_id' then
      select i.codigo, i.deposito_id into v_item from public.items i where i.id = (d ->> 'item_id')::uuid;
      v_dep := v_item.deposito_id;
    end if;
    v_detalle := case a.tabla
      when 'reparaciones' then case a.accion when 'insert' then 'Alta de la reparación' when 'delete' then 'Baja de la reparación' else 'Reparación modificada' end
      when 'reparacion_items' then case a.accion when 'insert' then 'Repuesto enviado: ' when 'delete' then 'Repuesto quitado: ' else 'Repuesto modificado: ' end || coalesce(a.descripcion, '')
      else coalesce(a.descripcion, 'Entrega') end;

  elsif a.tabla = 'retiro_items' then
    v_sobre := 'repuesto';
    select i.id, i.codigo, i.descripcion, i.deposito_id into v_item from public.items i where i.id = (d ->> 'item_id')::uuid;
    v_registro := coalesce(v_item.id::text, d ->> 'item_id');
    v_codigo := v_item.codigo;
    v_titulo := coalesce(v_item.descripcion, '');
    v_dep := v_item.deposito_id;
    v_detalle := case when a.accion = 'delete' then 'Línea de retiro anulada: ' else 'Retiro corregido: ' end || coalesce(a.descripcion, '');

  elsif a.tabla in ('ajustes_inventario', 'ajuste_items') then
    -- lo que hacen con el stock ya queda en los movimientos
    return;

  else
    v_sobre := 'configuracion';
    v_titulo := case a.tabla when 'licencia' then 'Plan contratado' when 'preferencias_modulos' then 'Módulos' when 'depositos' then 'Depósitos' else a.tabla end;
    v_detalle := coalesce(nullif(a.descripcion, ''), case a.accion when 'insert' then 'Alta' when 'delete' then 'Baja' else 'Modificación' end);
  end if;

  insert into public.actividad (momento, usuario_id, usuario_nombre, sobre, registro_id, codigo, titulo, deposito_id, accion, detalle, busqueda)
  values (a.created_at, a.usuario_id, coalesce(a.usuario_nombre, a.usuario_email), v_sobre, v_registro, v_codigo, v_titulo, v_dep, v_accion, v_detalle,
          public.texto_de_busqueda(concat_ws(' ', v_codigo, v_titulo, v_detalle)));
end;
$$;
revoke execute on function public._actividad_registrar_auditoria(public.audit_log) from public, anon, authenticated;

-- Anota en "actividad" un movimiento de stock: "Stock 1 → 0 (retiro, sector Secado)".
create or replace function public._actividad_registrar_movimiento(m public.movimientos_stock)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_nombre text;
  v_detalle text;
  v_causa text;
begin
  select i.codigo, i.descripcion into v_item from public.items i where i.id = m.item_id;
  select coalesce(nullif(trim(concat(u.nombre, ' ', u.apellido)), ''), u.email) into v_nombre from public.usuarios_perfil u where u.id = m.usuario_id;
  v_causa := concat_ws(', ',
    lower(left(m.detalle, 1)) || substr(m.detalle, 2),
    case when m.sector is not null then 'sector ' || m.sector end,
    case when m.ref_tabla = 'ajustes_inventario' and m.motivo is not null and m.motivo <> m.detalle then left(m.motivo, 60) end,
    m.comprobante);
  v_detalle := case when m.existencia is not null
    then 'Stock ' || trim_scale(m.existencia - m.entrada + m.salida)::text || ' → ' || trim_scale(m.existencia)::text
    else 'Stock ' || case when m.entrada > 0 then '+' || trim_scale(m.entrada)::text else '-' || trim_scale(m.salida)::text end end
    || case when coalesce(v_causa, '') <> '' then ' (' || v_causa || ')' else '' end;

  insert into public.actividad (momento, usuario_id, usuario_nombre, sobre, registro_id, codigo, titulo, deposito_id, accion, detalle, busqueda)
  values (m.created_at, m.usuario_id, coalesce(v_nombre, 'Sistema'), 'repuesto', m.item_id::text, v_item.codigo, coalesce(v_item.descripcion, ''), m.deposito_id,
          case when m.entrada > 0 then 'carga' else 'salida' end, v_detalle,
          public.texto_de_busqueda(concat_ws(' ', v_item.codigo, v_item.descripcion, v_detalle)));
end;
$$;
revoke execute on function public._actividad_registrar_movimiento(public.movimientos_stock) from public, anon, authenticated;

create or replace function public.actividad_trg_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._actividad_registrar_auditoria(new);
  return null;
end;
$$;

create or replace function public.actividad_trg_movimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._actividad_registrar_movimiento(new);
  return null;
end;
$$;

drop trigger if exists trg_actividad_auditoria on public.audit_log;
create trigger trg_actividad_auditoria after insert on public.audit_log for each row execute function public.actividad_trg_auditoria();
drop trigger if exists trg_actividad_movimiento on public.movimientos_stock;
create trigger trg_actividad_movimiento after insert on public.movimientos_stock for each row execute function public.actividad_trg_movimiento();

-- Lo que ya había: se anota todo el historial y todos los movimientos existentes.
select public._actividad_registrar_auditoria(a) from public.audit_log a where not exists (select 1 from public.actividad) order by a.id;
select public._actividad_registrar_movimiento(m) from public.movimientos_stock m
  where not exists (select 1 from public.actividad where accion in ('carga', 'salida')) order by m.created_at, m.id;

-- El historial, de a páginas (los más nuevos primero) y con los filtros del informe. Lo que no se puede ver no sale.
--   p_usuario: quién lo hizo · p_deposito · p_sobre: repuesto, reparacion, proveedor… · p_acciones: alta, carga, salida, modificacion, eliminacion
--   p_texto: código, nombre o detalle · p_antes_en / p_antes_id: la última fila de la página anterior · p_limite: hasta 5000 (para descargar)
-- La consulta se arma solo con los filtros elegidos (con sus valores ya escritos, bien citados), así la base elige el índice que conviene para cada caso:
-- por fecha, por persona, por depósito, por tipo o por texto. Con un millón de filas, cada página sale en milisegundos.
create or replace function public.historial_de_actividad(
  p_usuario uuid default null, p_deposito uuid default null, p_sobre text[] default null, p_acciones text[] default null,
  p_desde timestamptz default null, p_hasta timestamptz default null, p_texto text default null,
  p_antes_en timestamptz default null, p_antes_id bigint default null, p_limite integer default 50)
returns table (id bigint, momento timestamptz, usuario_id uuid, usuario_nombre text, sobre text, registro_id text, codigo text, titulo text,
               deposito_id uuid, deposito text, accion text, detalle text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_donde text[] := '{}';
  v_deps uuid[];
  v_palabra text;
begin
  if not public.can_ver_auditoria() then
    raise exception 'No autorizado: ver el historial requiere el permiso "Ver auditoría".';
  end if;
  p_limite := least(greatest(coalesce(p_limite, 50), 1), 5000);

  if not public.is_owner() then
    select coalesce(array_agg(x), '{}') into v_deps from public.depositos_del_usuario() x;
    v_donde := v_donde || format('a.sobre not in (%L, %L) and (a.deposito_id is null or a.deposito_id = any(%L::uuid[]))', 'usuario', 'configuracion', v_deps);
  end if;
  if p_usuario is not null then v_donde := v_donde || format('a.usuario_id = %L::uuid', p_usuario); end if;
  if p_deposito is not null then v_donde := v_donde || format('a.deposito_id = %L::uuid', p_deposito); end if;
  if coalesce(cardinality(p_sobre), 0) > 0 then
    v_donde := v_donde || case when cardinality(p_sobre) = 1 then format('a.sobre = %L', p_sobre[1]) else format('a.sobre = any(%L::text[])', p_sobre) end;
  end if;
  if coalesce(cardinality(p_acciones), 0) > 0 then
    v_donde := v_donde || case when cardinality(p_acciones) = 1 then format('a.accion = %L', p_acciones[1]) else format('a.accion = any(%L::text[])', p_acciones) end;
  end if;
  if p_desde is not null then v_donde := v_donde || format('a.momento >= %L::timestamptz', p_desde); end if;
  if p_hasta is not null then v_donde := v_donde || format('a.momento <= %L::timestamptz', p_hasta); end if;
  if p_antes_en is not null then v_donde := v_donde || format('(a.momento, a.id) < (%L::timestamptz, %L::bigint)', p_antes_en, coalesce(p_antes_id, 0)); end if;
  -- cada palabra, sin tildes ni mayúsculas; un "%" o "_" escrito se busca tal cual
  for v_palabra in select public.texto_de_busqueda(w) from regexp_split_to_table(btrim(coalesce(p_texto, '')), '\s+') as w where w <> '' loop
    if v_palabra <> '' then
      v_donde := v_donde || format('a.busqueda like %L', '%' || replace(replace(replace(v_palabra, '\', '\\'), '%', '\%'), '_', '\_') || '%');
    end if;
  end loop;

  return query execute
    'select a.id, a.momento, a.usuario_id, a.usuario_nombre, a.sobre, a.registro_id, a.codigo, a.titulo, a.deposito_id, d.nombre, a.accion, a.detalle
     from public.actividad a left join public.depositos d on d.id = a.deposito_id'
    || case when cardinality(v_donde) > 0 then ' where ' || array_to_string(v_donde, ' and ') else '' end
    || format(' order by a.momento desc, a.id desc limit %s', p_limite);
end;
$$;
revoke execute on function public.historial_de_actividad(uuid, uuid, text[], text[], timestamptz, timestamptz, text, timestamptz, bigint, integer) from public, anon;
grant execute on function public.historial_de_actividad(uuid, uuid, text[], text[], timestamptz, timestamptz, text, timestamptz, bigint, integer) to authenticated;

-- Cuántas filas da un filtro, contando como mucho hasta p_tope (para avisar antes de una descarga muy grande sin recorrer todo).
create or replace function public.historial_de_actividad_cantidad(
  p_usuario uuid default null, p_deposito uuid default null, p_sobre text[] default null, p_acciones text[] default null,
  p_desde timestamptz default null, p_hasta timestamptz default null, p_texto text default null, p_tope integer default 1001)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.historial_de_actividad(p_usuario, p_deposito, p_sobre, p_acciones, p_desde, p_hasta, p_texto, null, null, least(greatest(coalesce(p_tope, 1001), 1), 5000));
$$;
revoke execute on function public.historial_de_actividad_cantidad(uuid, uuid, text[], text[], timestamptz, timestamptz, text, integer) from public, anon;
grant execute on function public.historial_de_actividad_cantidad(uuid, uuid, text[], text[], timestamptz, timestamptz, text, integer) to authenticated;

-- Las personas para el filtro: el dueño ve a todas; el resto, a quienes comparten algún depósito con él (y a sí mismo).
create or replace function public.historial_personas()
returns table (id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_ver_auditoria() then
    raise exception 'No autorizado: ver el historial requiere el permiso "Ver auditoría".';
  end if;
  return query
  select u.id, coalesce(nullif(trim(concat(u.nombre, ' ', u.apellido)), ''), u.email)
  from public.usuarios_perfil u
  where public.is_owner() or u.id = auth.uid()
     or exists (select 1 from public.usuarios_depositos ud where ud.usuario_id = u.id and ud.deposito_id in (select public.depositos_del_usuario()))
  order by 2;
end;
$$;
revoke execute on function public.historial_personas() from public, anon;
grant execute on function public.historial_personas() to authenticated;

-- Los depósitos para el filtro: los que puede ver quien consulta y, si se eligió una persona, solo los de esa persona.
create or replace function public.historial_depositos(p_usuario uuid default null)
returns table (id uuid, nombre text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_ver_auditoria() then
    raise exception 'No autorizado: ver el historial requiere el permiso "Ver auditoría".';
  end if;
  return query
  select d.id, d.nombre from public.depositos d
  where d.id in (select public.depositos_del_usuario())
    and (p_usuario is null
         or exists (select 1 from public.usuarios_perfil u where u.id = p_usuario and u.es_owner)
         or exists (select 1 from public.usuarios_depositos ud where ud.usuario_id = p_usuario and ud.deposito_id = d.id))
  order by d.codigo;
end;
$$;
revoke execute on function public.historial_depositos(uuid) from public, anon;
grant execute on function public.historial_depositos(uuid) to authenticated;
