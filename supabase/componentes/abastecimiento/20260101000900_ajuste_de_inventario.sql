-- Parte "abastecimiento" de supabase/migrations/20260101000900_ajuste_de_inventario.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- ---------------------------------------------------------------------------------------------
-- Las tablas
-- ---------------------------------------------------------------------------------------------
create table public.ajustes_inventario (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  usuario_id uuid not null references public.usuarios_perfil(id),
  motivo text not null check (char_length(btrim(motivo)) between 1 and 500),
  anulado boolean not null default false,
  anulado_por uuid references public.usuarios_perfil(id),
  anulado_at timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or char_length(btrim(motivo_anulacion)) between 1 and 500),
  constraint ajuste_anulado_completo check (
    (anulado = false and anulado_por is null and anulado_at is null and motivo_anulacion is null)
    or (anulado = true and anulado_por is not null and anulado_at is not null and motivo_anulacion is not null)
  )
);

create index ajustes_inventario_created_at_idx on public.ajustes_inventario (created_at desc);

create table public.ajuste_items (
  id uuid primary key default gen_random_uuid(),
  ajuste_id uuid not null references public.ajustes_inventario(id) on delete restrict,
  item_id uuid not null references public.items(id) on delete restrict,
  tipo text not null check (tipo in ('suma', 'resta')),
  cantidad numeric not null check (cantidad > 0),
  stock_antes numeric,
  stock_despues numeric,
  unique (ajuste_id, item_id)
);

create index ajuste_items_item_idx on public.ajuste_items (item_id);

alter table public.ajustes_inventario enable row level security;

alter table public.ajuste_items enable row level security;

-- Solo se pueden leer (quien tiene el permiso). Escribir se hace únicamente con las funciones de abajo.
create policy ajustes_select on public.ajustes_inventario for select to authenticated using (public.can_ajustar_inventario());

create policy ajuste_items_select on public.ajuste_items for select to authenticated using (public.can_ajustar_inventario());

revoke all on public.ajustes_inventario, public.ajuste_items from anon;

revoke insert, update, delete, truncate, references, trigger on public.ajustes_inventario, public.ajuste_items from authenticated;

-- Mismas dos reglas de siempre en cada tabla: módulo Depósito activo y usuario activo.
create policy bloqueo_modulo on public.ajustes_inventario as restrictive for all to public
  using (public.modulo_activo('deposito')) with check (public.modulo_activo('deposito'));

create policy bloqueo_modulo on public.ajuste_items as restrictive for all to public
  using (public.modulo_activo('deposito')) with check (public.modulo_activo('deposito'));

create policy requiere_usuario_activo on public.ajustes_inventario as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

create policy requiere_usuario_activo on public.ajuste_items as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

-- ---------------------------------------------------------------------------------------------
-- Nada se edita ni se borra (ni con la clave de servicio): un ajuste solo se puede anular
-- ---------------------------------------------------------------------------------------------
create or replace function public.ajustes_proteger()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'Los ajustes de inventario no se borran: si hay un error, el dueño los anula.';
  end if;
  if tg_table_name = 'ajuste_items' then
    raise exception 'Las líneas de un ajuste no se modifican: si hay un error, el dueño anula el ajuste.';
  end if;
  if old.anulado then
    raise exception 'Este ajuste ya está anulado.';
  end if;
  if new.anulado is not true
     or (new.id, new.created_at, new.usuario_id, new.motivo) is distinct from (old.id, old.created_at, old.usuario_id, old.motivo) then
    raise exception 'Un ajuste solo se puede anular; no se modifica.';
  end if;
  return new;
end;
$$;

create trigger trg_ajustes_proteger before update or delete on public.ajustes_inventario
  for each row execute function public.ajustes_proteger();

create trigger trg_ajustes_proteger_vaciar before truncate on public.ajustes_inventario
  for each statement execute function public.ajustes_proteger();

create trigger trg_ajuste_items_proteger before update or delete on public.ajuste_items
  for each row execute function public.ajustes_proteger();

create trigger trg_ajuste_items_proteger_vaciar before truncate on public.ajuste_items
  for each statement execute function public.ajustes_proteger();

-- ---------------------------------------------------------------------------------------------
-- El stock cambia solo desde acá (así el cambio queda como parte del ajuste y no como una edición suelta)
-- ---------------------------------------------------------------------------------------------
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
  update items set stock = new.stock_despues where id = new.item_id;
  return new;
end;
$$;

create trigger trg_ajuste_items_aplicar before insert on public.ajuste_items
  for each row execute function public.ajuste_items_aplicar();

-- ---------------------------------------------------------------------------------------------
-- Historial del sistema (audit_log): cada ajuste, cada línea y cada anulación
-- ---------------------------------------------------------------------------------------------
create or replace function public.fn_audit_log_ajuste_items()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_actor record; v_it record; v_motivo text;
begin
  select * into v_actor from _aud_actor();
  select codigo, descripcion into v_it from items where id = new.item_id;
  select motivo into v_motivo from ajustes_inventario where id = new.ajuste_id;
  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    'ajuste_items', new.id::text,
    concat('Ajuste de inventario · ', v_it.codigo, ' — ', left(v_it.descripcion, 60), ' · ',
           case new.tipo when 'suma' then 'suma ' else 'resta ' end, new.cantidad,
           ' (stock ', new.stock_antes, ' → ', new.stock_despues, ') · motivo: ', v_motivo),
    'insert', auth.uid(), v_actor.p_nombre, v_actor.p_email, null, to_jsonb(new)
  );
  return null;
end;
$$;

create trigger trg_audit_ajuste_items after insert on public.ajuste_items
  for each row execute function public.fn_audit_log_ajuste_items();

create or replace function public.fn_audit_log_ajustes()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_actor record;
begin
  select * into v_actor from _aud_actor();
  if tg_op = 'INSERT' then
    insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
    values ('ajustes_inventario', new.id::text, concat('Ajuste de inventario · motivo: ', new.motivo),
            'insert', auth.uid(), v_actor.p_nombre, v_actor.p_email, null, to_jsonb(new));
  else
    insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
    values ('ajustes_inventario', new.id::text,
            concat('Ajuste de inventario ANULADO · motivo de la anulación: ', new.motivo_anulacion, ' (ajuste original: ', new.motivo, ')'),
            'update', auth.uid(), v_actor.p_nombre, v_actor.p_email, to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end;
$$;

create trigger trg_ajustes_auditar after insert or update on public.ajustes_inventario
  for each row execute function public.fn_audit_log_ajustes();

-- Al anular, el stock vuelve a como estaba (línea por línea, también anotado en el historial).
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
    update items set stock = v_nuevo where id = v_lin.item_id;
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

create trigger trg_ajustes_revertir_stock after update on public.ajustes_inventario
  for each row when (old.anulado is false and new.anulado is true)
  execute function public.ajustes_revertir_stock();

-- ---------------------------------------------------------------------------------------------
-- Las funciones que usa la aplicación
-- ---------------------------------------------------------------------------------------------
create or replace function public.crear_ajuste_inventario(p_motivo text, p_lineas jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; v_linea jsonb; v_tipo text; v_cantidad numeric; v_item uuid;
begin
  perform public.exigir_modulo('deposito');
  if not public.can_ajustar_inventario() then raise exception 'No autorizado: no tenés permiso para ajustar el inventario.'; end if;
  if p_motivo is null or char_length(btrim(p_motivo)) = 0 then raise exception 'Indicá el motivo del ajuste.'; end if;
  if char_length(btrim(p_motivo)) > 500 then raise exception 'El motivo es demasiado largo (máximo 500 caracteres).'; end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agregá al menos un artículo.';
  end if;
  if jsonb_array_length(p_lineas) > 500 then raise exception 'Un ajuste puede tener hasta 500 artículos.'; end if;
  if (select count(distinct value ->> 'item_id') from jsonb_array_elements(p_lineas)) <> jsonb_array_length(p_lineas) then
    raise exception 'Un artículo figura más de una vez en el ajuste.';
  end if;

  insert into ajustes_inventario (usuario_id, motivo) values (auth.uid(), btrim(p_motivo)) returning id into v_id;

  -- en orden de artículo, para que dos ajustes a la vez no se traben entre sí
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
    insert into ajuste_items (ajuste_id, item_id, tipo, cantidad) values (v_id, v_item, v_tipo, v_cantidad);
  end loop;
  return v_id;
end;
$$;

create or replace function public.anular_ajuste_inventario(p_ajuste_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_anulado boolean;
begin
  perform public.exigir_modulo('deposito');
  if not public.is_owner() then raise exception 'No autorizado: solo un dueño puede anular ajustes.'; end if;
  if p_motivo is null or char_length(btrim(p_motivo)) = 0 then raise exception 'Indicá el motivo de la anulación.'; end if;
  select anulado into v_anulado from ajustes_inventario where id = p_ajuste_id for update;
  if not found then raise exception 'Ese ajuste no existe.'; end if;
  if v_anulado then raise exception 'Ese ajuste ya está anulado.'; end if;
  update ajustes_inventario
     set anulado = true, anulado_por = auth.uid(), anulado_at = now(), motivo_anulacion = left(btrim(p_motivo), 500)
   where id = p_ajuste_id;
end;
$$;

-- Los ajustes de UN repuesto, para su historial (los puede ver quien ve el historial de retiros del repuesto).
create or replace function public.historial_ajustes_por_item(p_item_id uuid)
returns table(id uuid, created_at timestamptz, usuario_id uuid, tipo text, cantidad numeric, stock_antes numeric, stock_despues numeric,
              motivo text, anulado boolean, anulado_at timestamptz, motivo_anulacion text)
language sql stable security definer set search_path to 'public' as $$
  select ai.id, a.created_at, a.usuario_id, ai.tipo, ai.cantidad, ai.stock_antes, ai.stock_despues,
         a.motivo, a.anulado, a.anulado_at, a.motivo_anulacion
  from ajuste_items ai
  join ajustes_inventario a on a.id = ai.ajuste_id
  where ai.item_id = p_item_id
    and public.modulo_activo('deposito')
    and exists (
      select 1 from usuarios_perfil up
      where up.id = auth.uid() and up.activo is true and (up.mantenimiento_rol is not null or is_owner())
    )
  order by a.created_at desc;
$$;

revoke execute on function public.crear_ajuste_inventario(text, jsonb) from public, anon;

revoke execute on function public.anular_ajuste_inventario(uuid, text) from public, anon;

revoke execute on function public.historial_ajustes_por_item(uuid) from public, anon;

revoke execute on function public.ajustes_proteger() from public, anon;

revoke execute on function public.ajuste_items_aplicar() from public, anon;

revoke execute on function public.fn_audit_log_ajuste_items() from public, anon;

revoke execute on function public.fn_audit_log_ajustes() from public, anon;

revoke execute on function public.ajustes_revertir_stock() from public, anon;

grant execute on function public.crear_ajuste_inventario(text, jsonb) to authenticated, service_role;

grant execute on function public.anular_ajuste_inventario(uuid, text) to authenticated, service_role;

grant execute on function public.historial_ajustes_por_item(uuid) to authenticated, service_role;
