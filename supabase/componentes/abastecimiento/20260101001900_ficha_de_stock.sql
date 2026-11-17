-- Ficha de movimientos por repuesto: UN solo lugar donde cambia el stock.
--
-- Hasta ahora el stock lo cambiaban a mano unos diez triggers y funciones distintos (retiros, reparaciones, ajustes, anulaciones). Ahora todos llaman a una sola función,
-- mover_stock(), que cambia el stock y anota el movimiento (cuánto entró o salió y cuánto quedó) en la misma operación. La lista de movimientos de cada repuesto sale de ahí
-- y nada más puede tocar el stock: cualquier cambio que no pase por mover_stock() se rechaza.

-- ---------------------------------------------------------------------------------------------
-- 1) La lista de movimientos (solo se agrega, nunca se edita ni se borra)
-- ---------------------------------------------------------------------------------------------
create table public.movimientos_stock (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.items(id) on delete cascade,
  created_at timestamptz not null default now(),
  tipo text not null check (tipo in ('carga', 'ajuste', 'retiro', 'reparacion', 'otro')),
  detalle text not null,
  entrada numeric not null default 0 check (entrada >= 0),
  salida numeric not null default 0 check (salida >= 0),
  -- lo que quedó en stock después de este movimiento (vacío en los movimientos viejos que se registraron antes de llevar el saldo)
  existencia numeric check (existencia >= 0),
  comprobante text,
  referencia text,
  sector text,
  motivo text,
  ref_tabla text,
  ref_id uuid,
  usuario_id uuid
);

create index movimientos_stock_item_idx on public.movimientos_stock (item_id, id desc);
create index movimientos_stock_created_at_idx on public.movimientos_stock (created_at desc);

alter table public.movimientos_stock enable row level security;

-- Se lee con la función ficha_de_stock (abajo); directo, solo quien ve el historial de un repuesto.
create policy movimientos_stock_select on public.movimientos_stock for select to authenticated
  using (exists (select 1 from public.usuarios_perfil up where up.id = (select auth.uid()) and up.activo is true and (up.mantenimiento_rol is not null or (select public.is_owner()))));

revoke all on public.movimientos_stock from anon;
revoke insert, update, delete, truncate, references, trigger on public.movimientos_stock from authenticated;

create policy bloqueo_modulo on public.movimientos_stock as restrictive for all to public
  using (public.modulo_activo('deposito')) with check (public.modulo_activo('deposito'));

create policy requiere_usuario_activo on public.movimientos_stock as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

-- ---------------------------------------------------------------------------------------------
-- 2) mover_stock: el único lugar donde cambia el stock
-- ---------------------------------------------------------------------------------------------
-- p_delta es positivo si entra y negativo si sale. Devuelve el stock que quedó. Si no alcanza, la regla "el stock nunca es negativo" lo rechaza con su mensaje.
-- No verifica permisos: la llaman funciones internas que ya lo hicieron (por eso no se le da a las personas).
create or replace function public.mover_stock(p_item_id uuid, p_delta numeric, p_tipo text, p_detalle text, p_ref_tabla text default null, p_ref_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo numeric;
  v_tipo text := p_tipo;
  v_comprobante text;
  v_referencia text;
  v_sector text;
  v_motivo text;
  v_detalle text := p_detalle;
  v_existe boolean;
begin
  if p_delta is null or p_delta = 0 then
    return (select coalesce(stock, 0) from public.items where id = p_item_id);
  end if;

  perform set_config('app.mover_stock', 'on', true);
  update public.items set stock = coalesce(stock, 0) + p_delta where id = p_item_id returning stock into v_nuevo;
  v_existe := found;
  perform set_config('app.mover_stock', 'off', true);
  if not v_existe then raise exception 'El repuesto no existe.'; end if;

  if p_ref_tabla = 'ajustes_inventario' then
    select a.clase, public.comprobante_texto(a.clase, a.punto_venta, a.numero), a.referencia, a.motivo
      into v_tipo, v_comprobante, v_referencia, v_motivo
    from public.ajustes_inventario a where a.id = p_ref_id;
    v_detalle := coalesce(v_detalle, case v_tipo when 'carga' then 'Carga de stock' else 'Ajuste de inventario' end);
  elsif p_ref_tabla = 'retiros' then
    select s.nombre, r.observacion_general into v_sector, v_motivo
    from public.retiros r left join public.sectores s on s.id = r.sector_id where r.id = p_ref_id;
  elsif p_ref_tabla = 'reparaciones' then
    select r.motivo into v_motivo from public.reparaciones r where r.id = p_ref_id;
  end if;

  insert into public.movimientos_stock (item_id, tipo, detalle, entrada, salida, existencia, comprobante, referencia, sector, motivo, ref_tabla, ref_id, usuario_id)
  values (p_item_id, coalesce(v_tipo, 'otro'), coalesce(v_detalle, 'Movimiento de stock'), greatest(p_delta, 0), greatest(-p_delta, 0), v_nuevo,
          v_comprobante, v_referencia, v_sector, v_motivo, p_ref_tabla, p_ref_id, (select auth.uid()));
  return v_nuevo;
end;
$$;
revoke execute on function public.mover_stock(uuid, numeric, text, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3) Nada más puede cambiar el stock
-- ---------------------------------------------------------------------------------------------
create or replace function public.items_trg_stock_solo_por_movimiento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.mover_stock', true), 'off') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stock is not null and new.stock <> 0 then
      raise exception 'El stock no se carga al crear el repuesto: se registra con un movimiento (carga de stock).' using errcode = 'check_violation';
    end if;
  elsif new.stock is distinct from old.stock then
    raise exception 'El stock no se edita directamente: se cambia con un movimiento (carga de stock o ajuste), que queda registrado.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 4) Todos los que cambiaban el stock ahora llaman a mover_stock
-- ---------------------------------------------------------------------------------------------

-- Retiros
create or replace function public.ajustar_stock_por_retiro_item()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    perform public.mover_stock(new.item_id, -new.cantidad, 'retiro', 'Retiro', 'retiros', new.retiro_id);
  elsif tg_op = 'UPDATE' then
    perform public.mover_stock(new.item_id, old.cantidad - new.cantidad, 'retiro', 'Corrección de un retiro', 'retiros', new.retiro_id);
  elsif tg_op = 'DELETE' then
    perform public.mover_stock(old.item_id, old.cantidad, 'retiro', 'Retiro corregido: se quitó el artículo', 'retiros', old.retiro_id);
  end if;
  return null;
end;
$$;

-- Reparaciones: lo que sale al taller
create or replace function public.reparacion_items_trg_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    if new.descuenta_stock then
      perform public.mover_stock(new.item_id, -new.cantidad, 'reparacion', 'Salida a reparación', 'reparaciones', new.reparacion_id);
    end if;
    return new;
  end if;

  if exists (select 1 from reparacion_entregas where reparacion_item_id = old.id) then
    raise exception 'Esta línea ya tiene una entrega registrada — borrala primero para poder modificarla.';
  end if;

  if tg_op = 'UPDATE' then
    if new.descuenta_stock then
      perform public.mover_stock(new.item_id, old.cantidad - new.cantidad, 'reparacion', 'Cambio de cantidad en una reparación', 'reparaciones', new.reparacion_id);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.descuenta_stock then
      perform public.mover_stock(old.item_id, old.cantidad, 'reparacion', 'Se quitó de la reparación', 'reparaciones', old.reparacion_id);
    end if;
    return old;
  end if;
  return null;
end;
$$;

-- Reparaciones: lo que vuelve del taller
create or replace function public.reparacion_entregas_trg_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_item_id uuid;
  v_reparacion_id uuid;
begin
  if old.resultado = 'reparado' and old.repone_stock then
    select item_id, reparacion_id into v_item_id, v_reparacion_id from reparacion_items where id = old.reparacion_item_id;
    perform public.mover_stock(v_item_id, -old.cantidad_devuelta, 'reparacion', 'Se borró una entrega de la reparación', 'reparaciones', v_reparacion_id);
  end if;
  return old;
end;
$$;

create or replace function public.reparacion_entregas_trg_validar_y_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pendiente numeric;
  v_item_id uuid;
  v_reparacion_id uuid;
begin
  select reparacion_item_pendiente(new.reparacion_item_id) into v_pendiente;
  if new.cantidad_devuelta > v_pendiente then
    raise exception 'No podés registrar %, quedan % pendientes en esa línea.', new.cantidad_devuelta, v_pendiente;
  end if;

  if new.resultado = 'reparado' and new.repone_stock then
    select item_id, reparacion_id into v_item_id, v_reparacion_id from reparacion_items where id = new.reparacion_item_id;
    perform public.mover_stock(v_item_id, new.cantidad_devuelta, 'reparacion', 'Regreso de la reparación', 'reparaciones', v_reparacion_id);
  end if;
  return new;
end;
$$;

-- Reparaciones: eliminar (vuelve lo que estaba afuera) y restaurar (vuelve a salir)
create or replace function public.eliminar_reparacion(p_reparacion_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_linea record;
  v_pendiente numeric;
begin
  PERFORM public.exigir_modulo('deposito', 'proveedores');
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;

  for v_linea in select id, item_id from reparacion_items where reparacion_id = p_reparacion_id and descuenta_stock order by item_id loop
    v_pendiente := reparacion_item_pendiente(v_linea.id);
    if v_pendiente > 0 then
      perform public.mover_stock(v_linea.item_id, v_pendiente, 'reparacion', 'Reparación eliminada: vuelve lo que estaba afuera', 'reparaciones', p_reparacion_id);
    end if;
  end loop;

  update reparaciones set activo = false, eliminado_por = auth.uid(), eliminado_at = now() where id = p_reparacion_id;
end;
$$;

create or replace function public.restaurar_reparacion(p_reparacion_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_linea record;
  v_pendiente numeric;
begin
  PERFORM public.exigir_modulo('deposito', 'proveedores');
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;

  for v_linea in select id, item_id from reparacion_items where reparacion_id = p_reparacion_id and descuenta_stock order by item_id loop
    v_pendiente := reparacion_item_pendiente(v_linea.id);
    if v_pendiente > 0 then
      perform public.mover_stock(v_linea.item_id, -v_pendiente, 'reparacion', 'Reparación restaurada: vuelve a salir', 'reparaciones', p_reparacion_id);
    end if;
  end loop;

  update reparaciones set activo = true, eliminado_por = null, eliminado_at = null where id = p_reparacion_id;
end;
$$;

-- Cargas y ajustes
create or replace function public.ajuste_items_aplicar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_stock numeric; v_codigo text;
begin
  select coalesce(stock, 0), codigo into v_stock, v_codigo from items where id = new.item_id for update;
  if not found then raise exception 'El repuesto no existe.'; end if;
  new.stock_antes := v_stock;
  new.stock_despues := case new.tipo when 'suma' then v_stock + new.cantidad else v_stock - new.cantidad end;
  if new.stock_despues < 0 then
    raise exception 'No se puede restar % de %: el stock actual es %.', new.cantidad, v_codigo, v_stock;
  end if;
  perform public.mover_stock(new.item_id, case new.tipo when 'suma' then new.cantidad else -new.cantidad end, 'ajuste', null, 'ajustes_inventario', new.ajuste_id);
  return new;
end;
$$;

-- Anulación de una carga o un ajuste: el stock vuelve a como estaba
create or replace function public.ajustes_revertir_stock()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_actor record; v_lin record; v_codigo text; v_desc text; v_stock numeric; v_nuevo numeric;
begin
  select * into v_actor from _aud_actor();
  for v_lin in select * from ajuste_items where ajuste_id = new.id order by item_id loop
    select coalesce(stock, 0), codigo, descripcion into v_stock, v_codigo, v_desc from items where id = v_lin.item_id for update;
    v_nuevo := case v_lin.tipo when 'suma' then v_stock - v_lin.cantidad else v_stock + v_lin.cantidad end;
    if v_nuevo < 0 then
      raise exception 'No se puede anular: de % ya salieron unidades. El stock actual (%) es menor que lo que sumó este ajuste (%).', v_codigo, v_stock, v_lin.cantidad;
    end if;
    perform public.mover_stock(v_lin.item_id, v_nuevo - v_stock, 'ajuste', 'Anulación de ' || public.comprobante_texto(new.clase, new.punto_venta, new.numero), 'ajustes_inventario', new.id);
    insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
    values (
      'ajuste_items', v_lin.id::text,
      concat('Anulación de ajuste · ', v_codigo, ' — ', left(v_desc, 60), ' · se revierte ',
             case v_lin.tipo when 'suma' then 'suma ' else 'resta ' end, v_lin.cantidad,
             ' (stock ', v_stock, ' → ', v_nuevo, ') · motivo: ', new.motivo_anulacion),
      'update', auth.uid(), v_actor.p_nombre, v_actor.p_email, to_jsonb(v_lin),
      jsonb_build_object('stock_antes_de_anular', v_stock, 'stock_despues_de_anular', v_nuevo)
    );
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5) Los movimientos anteriores a esta lista, para que la ficha no empiece vacía
-- ---------------------------------------------------------------------------------------------
-- Cargas y ajustes ya tenían el stock de antes y de después. Los retiros no guardaron el saldo (queda vacío). Las reparaciones no se pasan: la ficha empieza con el saldo anterior.
insert into public.movimientos_stock (item_id, created_at, tipo, detalle, entrada, salida, existencia, comprobante, referencia, motivo, ref_tabla, ref_id, usuario_id)
select ai.item_id, a.created_at, a.clase, case a.clase when 'carga' then 'Carga de stock' else 'Ajuste de inventario' end,
       case when ai.tipo = 'suma' then ai.cantidad else 0 end, case when ai.tipo = 'resta' then ai.cantidad else 0 end,
       ai.stock_despues, public.comprobante_texto(a.clase, a.punto_venta, a.numero), a.referencia, a.motivo, 'ajustes_inventario', a.id, a.usuario_id
from public.ajuste_items ai join public.ajustes_inventario a on a.id = ai.ajuste_id
order by a.created_at, ai.id;

insert into public.movimientos_stock (item_id, created_at, tipo, detalle, entrada, salida, existencia, comprobante, motivo, ref_tabla, ref_id, usuario_id)
select ai.item_id, a.anulado_at, 'ajuste', 'Anulación de ' || public.comprobante_texto(a.clase, a.punto_venta, a.numero),
       case when ai.tipo = 'resta' then ai.cantidad else 0 end, case when ai.tipo = 'suma' then ai.cantidad else 0 end,
       null, public.comprobante_texto(a.clase, a.punto_venta, a.numero), a.motivo_anulacion, 'ajustes_inventario', a.id, a.anulado_por
from public.ajuste_items ai join public.ajustes_inventario a on a.id = ai.ajuste_id
where a.anulado and a.anulado_at is not null
order by a.anulado_at, ai.id;

insert into public.movimientos_stock (item_id, created_at, tipo, detalle, entrada, salida, existencia, sector, motivo, ref_tabla, ref_id, usuario_id)
select ri.item_id, r.created_at, 'retiro', 'Retiro', 0, ri.cantidad, null, s.nombre, r.observacion_general, 'retiros', r.id, r.usuario_id
from public.retiro_items ri join public.retiros r on r.id = ri.retiro_id left join public.sectores s on s.id = r.sector_id
order by r.created_at, ri.id;

-- ---------------------------------------------------------------------------------------------
-- 6) Lo que lee la aplicación: la ficha de un repuesto, de a tandas (las más nuevas primero)
-- ---------------------------------------------------------------------------------------------
create or replace function public.ficha_de_stock(p_item_id uuid, p_antes bigint default null, p_limite integer default 50)
returns table(id bigint, created_at timestamptz, tipo text, detalle text, entrada numeric, salida numeric, existencia numeric,
              comprobante text, referencia text, sector text, motivo text, usuario_id uuid)
language sql stable security definer set search_path to 'public' as $$
  select m.id, m.created_at, m.tipo, m.detalle, m.entrada, m.salida, m.existencia, m.comprobante, m.referencia, m.sector, m.motivo, m.usuario_id
  from movimientos_stock m
  where m.item_id = p_item_id
    and (p_antes is null or m.id < p_antes)
    and public.modulo_activo('deposito')
    and exists (
      select 1 from usuarios_perfil up
      where up.id = (select auth.uid()) and up.activo is true and (up.mantenimiento_rol is not null or (select is_owner()))
    )
  order by m.id desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;
revoke execute on function public.ficha_de_stock(uuid, bigint, integer) from public, anon;
grant execute on function public.ficha_de_stock(uuid, bigint, integer) to authenticated, service_role;
