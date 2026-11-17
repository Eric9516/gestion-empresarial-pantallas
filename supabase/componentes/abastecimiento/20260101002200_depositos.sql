-- Varios depósitos: estructura (etapa 1).
--
-- Un "depósito" es un área con SU catálogo de repuestos, su stock y sus usuarios (Mantenimiento, Insumos, Producción…). Cada depósito tiene su propia letra: los repuestos de
-- Mantenimiento empiezan con la M, los de otro depósito con la suya, y un repuesto pertenece a UN solo depósito (no se comparte). Por eso el stock sigue siendo el del repuesto
-- (items.stock): no hace falta una tabla de stock por depósito.
--
-- Esta etapa agrega los depósitos, a qué depósito pertenece cada repuesto y quién tiene acceso a cuáles. Todo lo que hay hoy queda en un primer depósito (con la letra que ya usan
-- los códigos, la M en Cremac) y todos los usuarios del depósito quedan asignados a él, así que no cambia nada de lo que ve el usuario. (Etapa siguiente: que las pantallas y las reglas
-- de seguridad separen lo que ve cada depósito, elegir depósito, crearlos y editarlos, y transferencias.)

-- ---------------------------------------------------------------------------------------------
-- 1) Los depósitos
-- ---------------------------------------------------------------------------------------------
create table public.depositos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (length(btrim(codigo)) between 1 and 10),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  -- la letra con la que empiezan los códigos de sus repuestos (M de Mantenimiento…): una distinta por depósito
  prefijo text not null unique check (prefijo ~ '^[A-Z]$'),
  -- el punto de venta con el que se numeran los comprobantes de este depósito (0001, 0002…)
  punto_venta integer not null default 1 check (punto_venta between 1 and 9999),
  activo boolean not null default true,
  -- el primero que se creó: recibe lo que ya existía y es el depósito de quien no tiene otro asignado
  es_principal boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index depositos_nombre_uidx on public.depositos (lower(btrim(nombre)));
-- a lo sumo un depósito principal
create unique index depositos_principal_uidx on public.depositos ((true)) where es_principal;

-- El primer depósito toma la letra que ya usan los códigos de los repuestos (la M en Cremac); si todavía no hay repuestos, la M.
insert into public.depositos (codigo, nombre, prefijo, es_principal)
select '01', 'Depósito principal',
       coalesce((select upper(left(codigo, 1)) from public.items where codigo ~ '^[A-Za-z]' group by 1 order by count(*) desc limit 1), 'M'),
       true
where not exists (select 1 from public.depositos);

create or replace function public.deposito_principal()
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select id from public.depositos where es_principal limit 1 $$;
-- Devuelve solo el id del depósito principal. Lo evalúa quien inserta un repuesto (es el valor por defecto de items.deposito_id), así que tiene que poder ejecutarla: a quien tiene sesión, no a anon.
revoke execute on function public.deposito_principal() from public, anon;
grant execute on function public.deposito_principal() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2) A qué depósito pertenece cada repuesto
-- ---------------------------------------------------------------------------------------------
alter table public.items add column if not exists deposito_id uuid references public.depositos(id) on delete restrict;
update public.items set deposito_id = public.deposito_principal() where deposito_id is null;
alter table public.items alter column deposito_id set not null;
-- Un repuesto cargado sin decir el depósito (importaciones, datos de prueba) va al principal.
alter table public.items alter column deposito_id set default public.deposito_principal();
create index if not exists items_deposito_codigo_idx on public.items (deposito_id, codigo) where activo;

-- ---------------------------------------------------------------------------------------------
-- 3) Quién tiene acceso a qué depósito
-- ---------------------------------------------------------------------------------------------
-- Cada usuario tiene su depósito; si se le da permiso sobre otros, puede hacer lo mismo que ya podía en el suyo en todos los asignados. El dueño ve todos, siempre.
create table public.usuarios_depositos (
  usuario_id uuid not null references public.usuarios_perfil(id) on delete cascade,
  deposito_id uuid not null references public.depositos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, deposito_id)
);
create index usuarios_depositos_deposito_idx on public.usuarios_depositos (deposito_id);

-- Lo que había: todos los usuarios del depósito quedan en el depósito principal.
insert into public.usuarios_depositos (usuario_id, deposito_id)
select up.id, public.deposito_principal() from public.usuarios_perfil up where up.mantenimiento_rol is not null
on conflict do nothing;

-- Un usuario que pasa a tener acceso al depósito y todavía no tiene ninguno asignado queda en el principal (después se le cambia o se le suman otros).
create or replace function public.usuarios_perfil_deposito_inicial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mantenimiento_rol is not null and not exists (select 1 from public.usuarios_depositos where usuario_id = new.id) then
    insert into public.usuarios_depositos (usuario_id, deposito_id) values (new.id, public.deposito_principal()) on conflict do nothing;
  end if;
  return new;
end;
$$;
create trigger trg_usuarios_perfil_deposito_inicial
  after insert or update of mantenimiento_rol on public.usuarios_perfil
  for each row execute function public.usuarios_perfil_deposito_inicial();

-- Los depósitos a los que el usuario que llama tiene acceso (el dueño, todos).
create or replace function public.depositos_del_usuario()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id from public.depositos d
  where (select public.is_owner()) or exists (select 1 from public.usuarios_depositos ud where ud.usuario_id = (select auth.uid()) and ud.deposito_id = d.id)
$$;
revoke execute on function public.depositos_del_usuario() from public, anon;
grant execute on function public.depositos_del_usuario() to authenticated;

-- El depósito donde se crea algo cuando no se dice cuál: el único del usuario o, si tiene varios, el principal si es uno de los suyos y si no el primero por código.
create or replace function public.deposito_por_defecto_del_usuario()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id from public.depositos d
  where d.activo and d.id in (select public.depositos_del_usuario())
  order by d.es_principal desc, d.codigo
  limit 1
$$;
revoke execute on function public.deposito_por_defecto_del_usuario() from public, anon;
grant execute on function public.deposito_por_defecto_del_usuario() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4) Seguridad: se leen (quien ve el depósito), no se escriben
-- ---------------------------------------------------------------------------------------------
alter table public.depositos enable row level security;
alter table public.usuarios_depositos enable row level security;

create policy depositos_select on public.depositos for select to authenticated
  using (exists (select 1 from public.usuarios_perfil up where up.id = (select auth.uid()) and up.activo is true and (up.mantenimiento_rol is not null or (select public.is_owner()))));
-- cada uno ve sus propias asignaciones; el dueño, las de todos
create policy usuarios_depositos_select on public.usuarios_depositos for select to authenticated
  using (usuario_id = (select auth.uid()) or (select public.is_owner()));

revoke all on public.depositos, public.usuarios_depositos from anon;
revoke insert, update, delete, truncate, references, trigger on public.depositos, public.usuarios_depositos from authenticated;

create policy bloqueo_modulo on public.depositos as restrictive for all to public
  using (public.modulo_activo('deposito')) with check (public.modulo_activo('deposito'));
create policy bloqueo_modulo on public.usuarios_depositos as restrictive for all to public
  using (public.modulo_activo('deposito')) with check (public.modulo_activo('deposito'));
create policy requiere_usuario_activo on public.depositos as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));
create policy requiere_usuario_activo on public.usuarios_depositos as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

-- ---------------------------------------------------------------------------------------------
-- 5) Cada movimiento anota de qué depósito es (el del repuesto)
-- ---------------------------------------------------------------------------------------------
alter table public.movimientos_stock add column if not exists deposito_id uuid references public.depositos(id);
update public.movimientos_stock m set deposito_id = i.deposito_id from public.items i where i.id = m.item_id and m.deposito_id is null;
alter table public.movimientos_stock alter column deposito_id set not null;

create or replace function public.mover_stock(p_item_id uuid, p_delta numeric, p_tipo text, p_detalle text, p_ref_tabla text default null, p_ref_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nuevo numeric;
  v_dep uuid;
  v_existe boolean;
  v_tipo text := p_tipo;
  v_comprobante text;
  v_referencia text;
  v_sector text;
  v_motivo text;
  v_detalle text := p_detalle;
begin
  if p_delta is null or p_delta = 0 then
    return (select coalesce(stock, 0) from public.items where id = p_item_id);
  end if;

  perform set_config('app.mover_stock', 'on', true);
  update public.items set stock = coalesce(stock, 0) + p_delta where id = p_item_id returning stock, deposito_id into v_nuevo, v_dep;
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

  insert into public.movimientos_stock (item_id, deposito_id, tipo, detalle, entrada, salida, existencia, comprobante, referencia, sector, motivo, ref_tabla, ref_id, usuario_id)
  values (p_item_id, v_dep, coalesce(v_tipo, 'otro'), coalesce(v_detalle, 'Movimiento de stock'), greatest(p_delta, 0), greatest(-p_delta, 0), v_nuevo,
          v_comprobante, v_referencia, v_sector, v_motivo, p_ref_tabla, p_ref_id, (select auth.uid()));
  return v_nuevo;
end;
$$;
revoke execute on function public.mover_stock(uuid, numeric, text, text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6) Crear un repuesto: va al depósito de quien lo crea (o al que se elija entre los suyos) y su código empieza con la letra de ese depósito
-- ---------------------------------------------------------------------------------------------
drop function if exists public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text);

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
  p_unidad text default 'Uni',
  p_deposito uuid default null
) returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fam text;
  v_sub text;
  v_num integer;
  v_dep uuid := coalesce(p_deposito, public.deposito_por_defecto_del_usuario());
  v_prefijo text;
  v_fila public.items;
begin
  perform public.exigir_modulo('deposito');
  if not public.is_mantenimiento_admin() then raise exception 'No autorizado: solo un administrador del depósito puede crear repuestos.'; end if;
  if p_stock is not null and p_stock < 0 then raise exception 'El stock no puede ser negativo.'; end if;

  -- el depósito tiene que existir, estar activo y ser uno de los del usuario
  if v_dep is null or v_dep not in (select public.depositos_del_usuario()) then
    raise exception 'No autorizado: no tenés acceso a ese depósito.';
  end if;
  select prefijo into v_prefijo from public.depositos where id = v_dep and activo;
  if v_prefijo is null then raise exception 'Ese depósito no está activo.'; end if;

  select f.codigo, s.codigo into v_fam, v_sub
  from public.subfamilias s join public.familias f on f.id = s.familia_id
  where s.id = p_subfamilia_id and f.id = p_familia_id;
  if v_fam is null then
    raise exception 'La subfamilia no pertenece a esa familia';
  end if;

  -- la numeración es de cada depósito: la misma subfamilia puede tener repuestos en varios depósitos, cada uno con su secuencia
  if p_numero is null or btrim(p_numero) = '' then
    perform pg_advisory_xact_lock(hashtextextended('repuesto:' || v_dep::text || ':' || p_subfamilia_id::text, 0));
    select coalesce(max(numero::integer), 0) + 1 into v_num
    from public.items where subfamilia_id = p_subfamilia_id and deposito_id = v_dep and numero ~ '^[0-9]{1,5}$';
    if v_num > 99999 then
      raise exception 'Esta subfamilia ya usó todos sus números (hasta 99999)';
    end if;
  else
    if btrim(p_numero) !~ '^[0-9]{1,5}$' then
      raise exception 'El número tiene que tener hasta 5 dígitos';
    end if;
    v_num := btrim(p_numero)::integer;
  end if;

  insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, ubicacion, stock_minimo, punto_pedido, detalles, unidad, deposito_id)
  values (v_prefijo || v_fam || v_sub || lpad(v_num::text, 5, '0'), lpad(v_num::text, 5, '0'), p_descripcion, p_familia_id, p_subfamilia_id,
          nullif(p_ubicacion, ''), coalesce(p_stock_minimo, 0), coalesce(p_punto_pedido, 0), nullif(p_detalles, ''), coalesce(nullif(btrim(p_unidad), ''), 'Uni'), v_dep)
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
revoke execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text, uuid) from public, anon;
grant execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text, uuid) to authenticated;
