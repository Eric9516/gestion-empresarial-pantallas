-- Cómo trabaja cada depósito: lo decide Compras (el dueño o el administrador de Compras), no el propio depósito.
--
-- No todos los depósitos trabajan igual: Mantenimiento deja que los operarios retiren y manda cosas a reparar; Insumos solo recibe mercadería y
-- entrega lo que le piden otras áreas (eso llega con los requerimientos, en la etapa de Compras). Cada depósito tiene dos interruptores:
--   usa_retiros       los operarios retiran artículos ("A retirar" y los retiros)
--   usa_reparaciones  manda cosas a reparar a un proveedor
-- Lo básico (buscar, recibir mercadería, ajustes y movimientos) lo tienen todos.
--
-- Los depósitos que ya existen quedan con todo prendido (nadie pierde lo que usaba); uno nuevo arranca apagado y se elige al crearlo.
-- Apagado no borra nada: lo que ya existe se sigue viendo y se puede terminar (una reparación pendiente se recibe); lo que la base frena es
-- empezar algo nuevo (un retiro, una reparación o una línea nueva en ellos), aunque se intente desde otra pantalla.
-- Crear o cambiar un depósito queda en el historial (Configuración → Historial → Depósitos), con quién lo hizo.
-- Además, el Informe de reposición pasa a ser de Compras y de quien tenga el permiso de verlo (ver la migración de la Base del mismo número).

set check_function_bodies = off;

alter table public.depositos add column if not exists usa_retiros boolean not null default false;
alter table public.depositos add column if not exists usa_reparaciones boolean not null default false;
update public.depositos set usa_retiros = true, usa_reparaciones = true;

-- Crear y editar: con los dos interruptores (las firmas cambian; las de antes se quitan para que no haya dos con el mismo nombre).
drop function if exists public.crear_deposito(text, text, text, text);
drop function if exists public.editar_deposito(uuid, text, text, text, boolean, text);

create or replace function public.crear_deposito(
  p_nombre text,
  p_prefijo text,
  p_color text default null,
  p_icono text default 'deposito',
  p_usa_retiros boolean default false,
  p_usa_reparaciones boolean default false
) returns public.depositos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_prefijo text := upper(btrim(coalesce(p_prefijo, '')));
  v_tope integer;
  v_activos integer;
  v_siguiente integer;
  v_fila public.depositos;
begin
  perform public.exigir_modulo('deposito');
  if auth.uid() is null or not public.usuario_activo() or not public.can_gestionar_depositos() then
    raise exception 'Solo el dueño o el administrador de Compras pueden crear depósitos.';
  end if;
  if length(v_nombre) not between 1 and 120 then
    raise exception 'El nombre del depósito no puede estar vacío ni pasar de 120 letras.';
  end if;
  if v_prefijo !~ '^[A-Z]$' then
    raise exception 'La letra del depósito tiene que ser una sola letra, de la A a la Z.';
  end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color tiene que ser del tipo #1a2b3c.';
  end if;
  if coalesce(p_icono, '') !~ '^[a-z]{2,20}$' then
    raise exception 'El ícono no es válido.';
  end if;

  -- Un solo alta a la vez: así dos pedidos simultáneos no pasan el tope ni reciben el mismo número.
  perform pg_advisory_xact_lock(hashtextextended('deposito:crear', 0));

  select max_depositos into v_tope from public.licencia where id = 1;
  select count(*) into v_activos from public.depositos where activo;
  if v_activos >= coalesce(v_tope, 1) then
    raise exception 'El plan permite hasta % depósito(s) y ya están todos en uso. Para tener más, pedí ampliar el plan.', coalesce(v_tope, 1);
  end if;

  select coalesce(max(codigo::integer), 0) + 1 into v_siguiente from public.depositos where codigo ~ '^[0-9]{1,9}$';
  insert into public.depositos (codigo, nombre, prefijo, color, icono, punto_venta, usa_retiros, usa_reparaciones)
  values (lpad(v_siguiente::text, 2, '0'), v_nombre, v_prefijo, p_color, p_icono,
          least((select coalesce(max(punto_venta), 0) + 1 from public.depositos), 9999),
          p_usa_retiros is true, p_usa_reparaciones is true)
  returning * into v_fila;
  return v_fila;
exception
  when unique_violation then
    if sqlerrm like '%depositos_nombre_uidx%' then
      raise exception 'Ya hay un depósito con ese nombre.';
    elsif sqlerrm like '%depositos_prefijo_key%' then
      raise exception 'Esa letra ya la usa otro depósito.';
    end if;
    raise;
end;
$$;
revoke execute on function public.crear_deposito(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.crear_deposito(text, text, text, text, boolean, boolean) to authenticated;

create or replace function public.editar_deposito(
  p_id uuid,
  p_nombre text,
  p_color text,
  p_icono text,
  p_activo boolean,
  p_prefijo text default null,
  p_usa_retiros boolean default null,
  p_usa_reparaciones boolean default null
) returns public.depositos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_prefijo text := upper(btrim(coalesce(p_prefijo, '')));
  v_actual public.depositos;
  v_tope integer;
  v_activos integer;
  v_fila public.depositos;
begin
  perform public.exigir_modulo('deposito');
  if auth.uid() is null or not public.usuario_activo() or not public.can_gestionar_depositos() then
    raise exception 'Solo el dueño o el administrador de Compras pueden editar depósitos.';
  end if;
  if length(v_nombre) not between 1 and 120 then
    raise exception 'El nombre del depósito no puede estar vacío ni pasar de 120 letras.';
  end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color tiene que ser del tipo #1a2b3c.';
  end if;
  if coalesce(p_icono, '') !~ '^[a-z]{2,20}$' then
    raise exception 'El ícono no es válido.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('deposito:crear', 0));
  select * into v_actual from public.depositos where id = p_id for update;
  if not found then
    raise exception 'No existe ese depósito.';
  end if;

  if p_activo is not true and v_actual.es_principal then
    raise exception 'El depósito principal no se puede desactivar.';
  end if;
  if p_activo is true and not v_actual.activo then
    select max_depositos into v_tope from public.licencia where id = 1;
    select count(*) into v_activos from public.depositos where activo;
    if v_activos >= coalesce(v_tope, 1) then
      raise exception 'El plan permite hasta % depósito(s) y ya están todos en uso. Para tener más, pedí ampliar el plan.', coalesce(v_tope, 1);
    end if;
  end if;

  -- La letra: solo se puede cambiar si todavía no hay artículos (sus códigos empiezan con ella).
  if v_prefijo <> '' and v_prefijo <> v_actual.prefijo then
    if v_prefijo !~ '^[A-Z]$' then
      raise exception 'La letra del depósito tiene que ser una sola letra, de la A a la Z.';
    end if;
    if exists (select 1 from public.items where deposito_id = p_id) then
      raise exception 'La letra ya no se puede cambiar: hay artículos cuyos códigos empiezan con ella.';
    end if;
  else
    v_prefijo := v_actual.prefijo;
  end if;

  update public.depositos
     set nombre = v_nombre, color = p_color, icono = p_icono, activo = (p_activo is true), prefijo = v_prefijo,
         -- sin decirlo (null), lo que usa el depósito queda como estaba
         usa_retiros = coalesce(p_usa_retiros, v_actual.usa_retiros), usa_reparaciones = coalesce(p_usa_reparaciones, v_actual.usa_reparaciones)
   where id = p_id
  returning * into v_fila;
  return v_fila;
exception
  when unique_violation then
    if sqlerrm like '%depositos_nombre_uidx%' then
      raise exception 'Ya hay un depósito con ese nombre.';
    elsif sqlerrm like '%depositos_prefijo_key%' then
      raise exception 'Esa letra ya la usa otro depósito.';
    end if;
    raise;
end;
$$;
revoke execute on function public.editar_deposito(uuid, text, text, text, boolean, text, boolean, boolean) from public, anon;
grant execute on function public.editar_deposito(uuid, text, text, text, boolean, text, boolean, boolean) to authenticated;

-- El historial de los depósitos: el alta y cada cambio, con lo que cambió (el color y el ícono no se anotan).
create or replace function public.fn_audit_log_depositos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor record;
  v_si constant text[] := array['no', 'sí'];
  v_cambios text;
begin
  select * into v_actor from _aud_actor();
  if tg_op = 'INSERT' then
    v_cambios := concat_ws('; ', 'alta (letra ' || new.prefijo || ')',
      'retiros de operarios: ' || v_si[new.usa_retiros::int + 1], 'reparaciones: ' || v_si[new.usa_reparaciones::int + 1]);
  else
    v_cambios := concat_ws('; ',
      _aud_cambio('nombre', old.nombre, new.nombre),
      _aud_cambio('letra', old.prefijo, new.prefijo),
      case when old.activo is distinct from new.activo then case when new.activo then 'reactivado' else 'desactivado' end end,
      _aud_cambio('retiros de operarios', v_si[old.usa_retiros::int + 1], v_si[new.usa_retiros::int + 1]),
      _aud_cambio('reparaciones', v_si[old.usa_reparaciones::int + 1], v_si[new.usa_reparaciones::int + 1]));
    if coalesce(v_cambios, '') = '' then
      return new;
    end if;
  end if;
  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values ('depositos', new.id::text, new.nombre || ' · ' || v_cambios, lower(tg_op), auth.uid(), v_actor.p_nombre, v_actor.p_email,
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
drop trigger if exists trg_audit_depositos on public.depositos;
create trigger trg_audit_depositos after insert or update on public.depositos for each row execute function public.fn_audit_log_depositos();

-- La base frena lo nuevo donde el depósito no lo usa.
create or replace function public.retiro_items_trg_deposito_usa_retiros()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from items i join depositos d on d.id = i.deposito_id where i.id = new.item_id and not d.usa_retiros) then
    raise exception 'En este depósito los operarios no retiran artículos (lo define Compras).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_retiro_items_deposito_usa_retiros on public.retiro_items;
create trigger trg_retiro_items_deposito_usa_retiros before insert on public.retiro_items
  for each row execute function public.retiro_items_trg_deposito_usa_retiros();

create or replace function public.reparaciones_trg_deposito_usa_reparaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'reparaciones' then
    -- una reparación nueva: alguno de los depósitos de quien la carga tiene que mandar cosas a reparar
    if auth.uid() is not null
       and not exists (select 1 from depositos d where d.activo and d.usa_reparaciones and d.id in (select depositos_del_usuario())) then
      raise exception 'Tu depósito no manda cosas a reparar (lo define Compras).';
    end if;
  elsif exists (select 1 from items i join depositos d on d.id = i.deposito_id where i.id = new.item_id and not d.usa_reparaciones) then
    raise exception 'El depósito de ese artículo no manda cosas a reparar (lo define Compras).';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reparaciones_deposito_usa_reparaciones on public.reparaciones;
create trigger trg_reparaciones_deposito_usa_reparaciones before insert on public.reparaciones
  for each row execute function public.reparaciones_trg_deposito_usa_reparaciones();
drop trigger if exists trg_reparacion_items_deposito_usa_reparaciones on public.reparacion_items;
create trigger trg_reparacion_items_deposito_usa_reparaciones before insert on public.reparacion_items
  for each row execute function public.reparaciones_trg_deposito_usa_reparaciones();

-- El Informe de reposición: Compras, los dueños y quien tenga el permiso (antes, los administradores del Depósito).
CREATE OR REPLACE FUNCTION public.repuestos_a_reponer(p_texto text DEFAULT NULL::text, p_familia_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_limite integer DEFAULT 500)
 RETURNS TABLE(id uuid, codigo text, numero text, descripcion text, detalles text, stock numeric, stock_minimo numeric, punto_pedido numeric, familia_id uuid, subfamilia_id uuid, estado_reposicion text, total bigint, total_sin_stock bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_palabras text[];
  v_utiles text[];
  v_conectoras constant text[] := array['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'a', 'un', 'una', 'unos', 'unas', 'para', 'con', 'sin', 'por'];
begin
  perform public.exigir_modulo('deposito');
  -- es el Informe de reposición: Compras (y los dueños), o quien tenga el permiso de verlo.
  if not public.usuario_activo() or not public.can_ver_informe() then
    raise exception 'No autorizado';
  end if;
  p_limite := least(greatest(coalesce(p_limite, 500), 1), 5000);

  select coalesce(array_agg(distinct x), '{}') into v_palabras
  from regexp_split_to_table(lower(btrim(coalesce(p_texto, ''))), '\s+') x where x <> '';
  select coalesce(array_agg(x), '{}') into v_utiles from unnest(v_palabras) x where x <> all (v_conectoras);
  if cardinality(v_utiles) = 0 then v_utiles := v_palabras; end if;

  return query
  select i.id, i.codigo, i.numero, i.descripcion, i.detalles, i.stock, i.stock_minimo, i.punto_pedido, i.familia_id, i.subfamilia_id, i.estado_reposicion,
         count(*) over () as total,
         count(*) filter (where coalesce(i.stock, 0) = 0) over () as total_sin_stock
  from public.items i
  where i.activo and i.stock_minimo > 0 and coalesce(i.stock, 0) <= i.punto_pedido
    and (p_familia_id is null or i.familia_id = p_familia_id)
    and (coalesce(p_estado, '') = '' or (p_estado = 'sin' and i.estado_reposicion is null) or i.estado_reposicion = p_estado)
    and not exists (select 1 from unnest(v_utiles) w where not public.palabra_coincide_repuesto(i.codigo, i.descripcion, i.palabras_clave, i.detalles, w))
  order by (coalesce(i.stock, 0) > 0), (i.stock_minimo - coalesce(i.stock, 0)) desc, i.codigo
  limit p_limite;
end;
$function$;

select public._funciones_a_la_app();
