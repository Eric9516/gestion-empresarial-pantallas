-- Movimientos de stock: cada carga o ajuste es un documento con número correlativo, y el stock solo cambia por un movimiento.
--
-- Qué hace esta migración:
--   1. Los artículos ganan su unidad de medida (Uni, Kg, Lt...).
--   2. Los ajustes de inventario pasan a ser "movimientos de stock": tienen tipo (carga o ajuste), fecha, referencia, observaciones, número correlativo y
--      una copia chica de los datos de la empresa de ese día (para reimprimir el comprobante tal como salió). Los ajustes que ya existían reciben su número en orden.
--   3. Un contador (numeradores) da números correlativos SIN saltos: se toma dentro de la misma operación que crea el documento, así que si la operación falla el número no se gasta.
--   4. Crear un movimiento: crear_movimiento_stock (carga: solo suma; ajuste: suma o resta por línea). crear_ajuste_inventario sigue funcionando igual (es un ajuste).
--   5. Crear un repuesto con stock inicial registra una "carga inicial"; importar stock desde Excel registra su movimiento (en partes de hasta 500 líneas).
--   6. El stock NO se puede cambiar directamente: la tabla de repuestos rechaza todo cambio de stock que venga de una persona (rol authenticated o anon); lo hacen solo las funciones
--      internas (retiros, reparaciones, movimientos), que corren con los permisos del dueño de la base. Así ningún camino puede tocar el stock sin dejar un movimiento.
--
-- El stock nunca queda negativo (ver 001700). Todo es "todo o nada".

-- 1) Unidad de medida del artículo
alter table public.items
  add column if not exists unidad text not null default 'Uni' check (char_length(btrim(unidad)) between 1 and 12);

-- 2) Los ajustes pasan a ser movimientos de stock
alter table public.ajustes_inventario disable trigger trg_ajustes_proteger;
alter table public.ajustes_inventario disable trigger trg_ajustes_auditar;

alter table public.ajustes_inventario
  add column if not exists clase text not null default 'ajuste' check (clase in ('carga', 'ajuste')),
  add column if not exists fecha date,
  add column if not exists referencia text check (referencia is null or char_length(referencia) <= 120),
  add column if not exists observaciones text check (observaciones is null or char_length(observaciones) <= 500),
  add column if not exists punto_venta integer not null default 1 check (punto_venta between 1 and 9999),
  add column if not exists numero bigint,
  add column if not exists emisor jsonb;

update public.ajustes_inventario
   set fecha = (created_at at time zone coalesce((select zona_horaria from public.configuracion where id = 1), 'UTC'))::date
 where fecha is null;

with orden as (select id, row_number() over (order by created_at, id) as n from public.ajustes_inventario where numero is null)
update public.ajustes_inventario a set numero = orden.n from orden where orden.id = a.id;

alter table public.ajustes_inventario enable trigger trg_ajustes_proteger;
alter table public.ajustes_inventario enable trigger trg_ajustes_auditar;

alter table public.ajustes_inventario alter column fecha set not null;
alter table public.ajustes_inventario alter column fecha set default public.hoy_local();
alter table public.ajustes_inventario alter column numero set not null;

create unique index if not exists ajustes_inventario_numero_uidx on public.ajustes_inventario (clase, punto_venta, numero);
create index if not exists ajustes_inventario_fecha_idx on public.ajustes_inventario (fecha desc, created_at desc);

-- 3) Números correlativos sin saltos
create table if not exists public.numeradores (
  tipo text not null,
  punto_venta integer not null default 1,
  ultimo bigint not null default 0,
  primary key (tipo, punto_venta)
);

alter table public.numeradores enable row level security;
revoke all on public.numeradores from anon, authenticated;

create policy bloqueo_modulo on public.numeradores as restrictive for all to public
  using ((select public.modulo_activo('deposito'))) with check ((select public.modulo_activo('deposito')));
create policy requiere_usuario_activo on public.numeradores as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

insert into public.numeradores (tipo, punto_venta, ultimo)
select 'AJU', 1, coalesce(max(numero), 0) from public.ajustes_inventario where clase = 'ajuste'
on conflict (tipo, punto_venta) do nothing;

create or replace function public.siguiente_numero(p_tipo text, p_punto_venta integer default 1)
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.numeradores as n (tipo, punto_venta, ultimo) values (p_tipo, p_punto_venta, 1)
  on conflict (tipo, punto_venta) do update set ultimo = n.ultimo + 1
  returning ultimo;
$$;
revoke execute on function public.siguiente_numero(text, integer) from public, anon, authenticated;

create or replace function public.comprobante_texto(p_clase text, p_punto_venta integer, p_numero bigint)
returns text
language sql
immutable
as $$
  select case p_clase when 'carga' then 'CAR' else 'AJU' end || ' ' || lpad(p_punto_venta::text, 4, '0') || '-' || lpad(p_numero::text, 8, '0');
$$;
grant execute on function public.comprobante_texto(text, integer, bigint) to authenticated;
revoke execute on function public.comprobante_texto(text, integer, bigint) from public, anon;

-- 4) Crear un movimiento
-- Interna: arma el documento, le da su número y carga las líneas siempre en el mismo orden (por artículo). No verifica permisos: los verifican quienes la llaman.
create or replace function public.registrar_movimiento_stock(
  p_clase text, p_fecha date, p_motivo text, p_referencia text, p_observaciones text, p_lineas jsonb, p_usuario uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_numero bigint;
  v_emisor jsonb;
  v_linea jsonb;
  v_tipo text;
  v_cantidad numeric;
  v_item uuid;
begin
  select jsonb_strip_nulls(jsonb_build_object(
           'nombre', empresa_nombre, 'razon_social', empresa_razon_social, 'cuit', empresa_cuit,
           'direccion', empresa_direccion, 'telefono', empresa_telefono, 'email', empresa_email, 'web', empresa_web))
    into v_emisor from public.configuracion where id = 1;

  v_numero := public.siguiente_numero(case p_clase when 'carga' then 'CAR' else 'AJU' end, 1);

  insert into public.ajustes_inventario (usuario_id, motivo, clase, fecha, referencia, observaciones, punto_venta, numero, emisor)
  values (p_usuario, btrim(p_motivo), p_clase, coalesce(p_fecha, public.hoy_local()), nullif(btrim(p_referencia), ''), nullif(btrim(p_observaciones), ''), 1, v_numero, v_emisor)
  returning id into v_id;

  for v_linea in select value from jsonb_array_elements(p_lineas) order by value ->> 'item_id' loop
    v_tipo := v_linea ->> 'tipo';
    if v_tipo not in ('suma', 'resta') then raise exception 'Cada artículo tiene que sumar o restar.'; end if;
    begin
      v_cantidad := (v_linea ->> 'cantidad')::numeric;
      v_item := (v_linea ->> 'item_id')::uuid;
    exception when others then
      raise exception 'Hay una línea con datos inválidos.';
    end;
    if v_cantidad is null or v_cantidad <= 0 then raise exception 'La cantidad de cada artículo tiene que ser mayor que cero.'; end if;
    insert into public.ajuste_items (ajuste_id, item_id, tipo, cantidad) values (v_id, v_item, v_tipo, v_cantidad);
  end loop;
  return v_id;
end;
$$;
revoke execute on function public.registrar_movimiento_stock(text, date, text, text, text, jsonb, uuid) from public, anon, authenticated;

create or replace function public.crear_movimiento_stock(
  p_clase text, p_fecha date, p_motivo text, p_referencia text, p_observaciones text, p_lineas jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_motivo text;
  v_fila public.ajustes_inventario;
begin
  perform public.exigir_modulo('deposito');
  if not public.can_ajustar_inventario() then raise exception 'No autorizado: no tenés permiso para cargar ni ajustar el stock.'; end if;
  if p_clase is null or p_clase not in ('carga', 'ajuste') then raise exception 'Elegí si es una carga de stock o un ajuste.'; end if;
  v_motivo := coalesce(nullif(btrim(p_motivo), ''), case when p_clase = 'carga' then 'Carga de stock' end);
  if v_motivo is null or char_length(v_motivo) = 0 then raise exception 'Indicá el motivo del ajuste.'; end if;
  if char_length(v_motivo) > 500 then raise exception 'El motivo es demasiado largo (máximo 500 caracteres).'; end if;
  if p_fecha is not null and p_fecha > public.hoy_local() then raise exception 'La fecha del movimiento no puede ser futura.'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agregá al menos un artículo.';
  end if;
  if jsonb_array_length(p_lineas) > 500 then raise exception '% puede tener hasta 500 artículos.', case when p_clase = 'carga' then 'Una carga' else 'Un ajuste' end; end if;
  if (select count(distinct value ->> 'item_id') from jsonb_array_elements(p_lineas)) <> jsonb_array_length(p_lineas) then
    raise exception 'Un artículo figura más de una vez en %.', case when p_clase = 'carga' then 'la carga' else 'el ajuste' end;
  end if;
  if p_clase = 'carga' and exists (select 1 from jsonb_array_elements(p_lineas) where value ->> 'tipo' is distinct from 'suma') then
    raise exception 'Una carga de stock solo suma: para restar hacé un ajuste.';
  end if;

  v_id := public.registrar_movimiento_stock(p_clase, p_fecha, v_motivo, p_referencia, p_observaciones, p_lineas, auth.uid());
  select * into v_fila from public.ajustes_inventario where id = v_id;
  return jsonb_build_object('id', v_id, 'comprobante', public.comprobante_texto(v_fila.clase, v_fila.punto_venta, v_fila.numero));
end;
$$;
revoke execute on function public.crear_movimiento_stock(text, date, text, text, text, jsonb) from public, anon;
grant execute on function public.crear_movimiento_stock(text, date, text, text, text, jsonb) to authenticated, service_role;

-- Los ajustes de siempre siguen funcionando igual (mismas reglas y mismos avisos): ahora son un movimiento de tipo "ajuste".
create or replace function public.crear_ajuste_inventario(p_motivo text, p_lineas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return (public.crear_movimiento_stock('ajuste', null, p_motivo, null, null, p_lineas) ->> 'id')::uuid;
end;
$$;
revoke execute on function public.crear_ajuste_inventario(text, jsonb) from public, anon;
grant execute on function public.crear_ajuste_inventario(text, jsonb) to authenticated, service_role;

-- Historial del sistema: dice "carga de stock" o "ajuste de inventario" según el tipo
create or replace function public.fn_audit_log_ajuste_items()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_actor record; v_it record; v_cab record;
begin
  select * into v_actor from _aud_actor();
  select codigo, descripcion into v_it from items where id = new.item_id;
  select motivo, clase, punto_venta, numero into v_cab from ajustes_inventario where id = new.ajuste_id;
  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    'ajuste_items', new.id::text,
    concat(case v_cab.clase when 'carga' then 'Carga de stock' else 'Ajuste de inventario' end, ' ', public.comprobante_texto(v_cab.clase, v_cab.punto_venta, v_cab.numero), ' · ',
           v_it.codigo, ' — ', left(v_it.descripcion, 60), ' · ',
           case new.tipo when 'suma' then 'suma ' else 'resta ' end, new.cantidad,
           ' (stock ', new.stock_antes, ' → ', new.stock_despues, ') · motivo: ', v_cab.motivo),
    'insert', auth.uid(), v_actor.p_nombre, v_actor.p_email, null, to_jsonb(new)
  );
  return null;
end;
$$;

create or replace function public.fn_audit_log_ajustes()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_actor record; v_texto text; v_tipo text;
begin
  select * into v_actor from _aud_actor();
  v_texto := public.comprobante_texto(coalesce(new.clase, 'ajuste'), coalesce(new.punto_venta, 1), new.numero);
  v_tipo := case new.clase when 'carga' then 'Carga de stock' else 'Ajuste de inventario' end;
  if tg_op = 'INSERT' then
    insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
    values ('ajustes_inventario', new.id::text, concat(v_tipo, ' ', v_texto, ' · motivo: ', new.motivo),
            'insert', auth.uid(), v_actor.p_nombre, v_actor.p_email, null, to_jsonb(new));
  else
    insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
    values ('ajustes_inventario', new.id::text,
            concat(v_tipo, ' ', v_texto, ' ANULADO · motivo de la anulación: ', new.motivo_anulacion, ' (movimiento original: ', new.motivo, ')'),
            'update', auth.uid(), v_actor.p_nombre, v_actor.p_email, to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end;
$$;

-- 5) Crear un repuesto: el stock inicial se registra como una carga (la fila se crea sin stock y el movimiento lo suma)
drop function if exists public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text);

create or replace function public.crear_repuesto(
  p_familia_id uuid,
  p_subfamilia_id uuid,
  p_numero text,
  p_descripcion text,
  p_ubicacion text,
  p_stock numeric,
  p_stock_minimo numeric,
  p_punto_pedido numeric,
  p_detalles text,
  p_unidad text default 'Uni'
) returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fam text;
  v_sub text;
  v_num integer;
  v_fila public.items;
begin
  perform public.exigir_modulo('deposito');
  if not public.is_mantenimiento_admin() then raise exception 'No autorizado: solo un administrador del depósito puede crear repuestos.'; end if;
  if p_stock is not null and p_stock < 0 then raise exception 'El stock no puede ser negativo.'; end if;

  select f.codigo, s.codigo into v_fam, v_sub
  from public.subfamilias s join public.familias f on f.id = s.familia_id
  where s.id = p_subfamilia_id and f.id = p_familia_id;
  if v_fam is null then
    raise exception 'La subfamilia no pertenece a esa familia';
  end if;

  if p_numero is null or btrim(p_numero) = '' then
    perform pg_advisory_xact_lock(hashtextextended('repuesto:' || p_subfamilia_id::text, 0));
    select coalesce(max(numero::integer), 0) + 1 into v_num
    from public.items where subfamilia_id = p_subfamilia_id and numero ~ '^[0-9]{1,5}$';
    if v_num > 99999 then
      raise exception 'Esta subfamilia ya usó todos sus números (hasta 99999)';
    end if;
  else
    if btrim(p_numero) !~ '^[0-9]{1,5}$' then
      raise exception 'El número tiene que tener hasta 5 dígitos';
    end if;
    v_num := btrim(p_numero)::integer;
  end if;

  insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, ubicacion, stock_minimo, punto_pedido, detalles, unidad)
  values ('M' || v_fam || v_sub || lpad(v_num::text, 5, '0'), lpad(v_num::text, 5, '0'), p_descripcion, p_familia_id, p_subfamilia_id,
          nullif(p_ubicacion, ''), coalesce(p_stock_minimo, 0), coalesce(p_punto_pedido, 0), nullif(p_detalles, ''), coalesce(nullif(btrim(p_unidad), ''), 'Uni'))
  returning * into v_fila;

  if p_stock is not null and p_stock > 0 then
    perform public.registrar_movimiento_stock(
      'carga', null, 'Carga inicial', null, 'Alta del repuesto ' || v_fila.codigo,
      jsonb_build_array(jsonb_build_object('item_id', v_fila.id, 'tipo', 'suma', 'cantidad', p_stock)), auth.uid());
    select * into v_fila from public.items where id = v_fila.id;
  end if;

  return v_fila;
end;
$$;

revoke execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text) from public, anon;
grant execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text) to authenticated;

-- Importar stock desde Excel: los datos de los repuestos se actualizan, y las diferencias de stock quedan registradas como ajustes ("Importación de stock desde Excel"),
-- en partes de hasta 500 líneas. Corre con los permisos del dueño de la base (el stock solo cambia desde un movimiento), verificando antes los permisos de quien llama.
create or replace function public.aplicar_importacion_stock(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lineas jsonb;
  v_total integer;
  v_partes integer;
  v_parte integer := 0;
  v_documentos jsonb := '[]'::jsonb;
  v_id uuid;
  v_desde integer;
begin
  perform public.exigir_modulo('deposito');
  if not public.is_mantenimiento_admin() or not public.can_ajustar_inventario() then
    raise exception 'No autorizado: importar stock requiere ser administrador del depósito con permiso para ajustar el inventario.';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('documentos', v_documentos);
  end if;

  -- 1) datos de los repuestos (sin tocar el stock), siempre en el mismo orden
  insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, stock_minimo, punto_pedido)
  select f.codigo, f.numero, f.descripcion, f.familia_id, f.subfamilia_id, coalesce(f.stock_minimo, 0), coalesce(f.punto_pedido, 0)
  from jsonb_to_recordset(p_filas) as f(codigo text, numero text, descripcion text, familia_id uuid, subfamilia_id uuid, stock numeric, stock_minimo numeric, punto_pedido numeric)
  order by f.codigo
  on conflict (codigo) do update
    set descripcion = excluded.descripcion, numero = excluded.numero, familia_id = excluded.familia_id, subfamilia_id = excluded.subfamilia_id,
        stock_minimo = excluded.stock_minimo, punto_pedido = excluded.punto_pedido;

  -- 2) las diferencias de stock, como líneas de ajuste
  select coalesce(jsonb_agg(jsonb_build_object('item_id', x.id, 'tipo', case when x.delta > 0 then 'suma' else 'resta' end, 'cantidad', abs(x.delta)) order by x.id), '[]'::jsonb)
    into v_lineas
  from (
    select i.id, f.stock - coalesce(i.stock, 0) as delta
    from jsonb_to_recordset(p_filas) as f(codigo text, stock numeric)
    join public.items i on i.codigo = f.codigo
    where f.stock is not null
  ) x
  where x.delta <> 0;

  v_total := jsonb_array_length(v_lineas);
  v_partes := (v_total + 499) / 500;
  while v_parte < v_partes loop
    v_desde := v_parte * 500;
    v_id := public.registrar_movimiento_stock(
      'ajuste', null, 'Importación de stock desde Excel', null,
      case when v_partes > 1 then 'Parte ' || (v_parte + 1) || ' de ' || v_partes else null end,
      (select jsonb_agg(value) from (select value from jsonb_array_elements(v_lineas) with ordinality t(value, n) where n > v_desde and n <= v_desde + 500 order by n) s),
      auth.uid());
    v_documentos := v_documentos || to_jsonb(v_id);
    v_parte := v_parte + 1;
  end loop;

  return jsonb_build_object('documentos', v_documentos, 'lineas', v_total);
end;
$$;
revoke execute on function public.aplicar_importacion_stock(jsonb) from public, anon;
grant execute on function public.aplicar_importacion_stock(jsonb) to authenticated;

-- 6) El stock solo cambia por un movimiento.
-- Lo cambian, sin pasar por acá, solo las funciones internas (retiros, reparaciones, movimientos): corren con los permisos del dueño de la base. Lo que viene directo de una persona
-- (rol authenticated o anon) se rechaza, ya sea editando el repuesto o creándolo con stock.
create or replace function public.items_trg_stock_solo_por_movimiento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.stock is not null and new.stock <> 0 then
        raise exception 'El stock no se carga al crear el repuesto: se registra con un movimiento (carga de stock).' using errcode = 'check_violation';
      end if;
    elsif new.stock is distinct from old.stock then
      raise exception 'El stock no se edita directamente: se cambia con un movimiento (carga de stock o ajuste), que queda registrado.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_items_stock_solo_por_movimiento on public.items;
create trigger trg_items_stock_solo_por_movimiento
  before insert or update of stock on public.items
  for each row execute function public.items_trg_stock_solo_por_movimiento();
