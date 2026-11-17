-- Permisos por depósito (pedido del encargado, 05/11/2026): cada persona tiene una lista de depósitos, cada uno con su rol (Administrador o
-- Usuario), y elige en cuál está con el selector de arriba (con una estrellita marca el que se abre al entrar). Hasta ahora el rol del
-- Depósito era uno solo para todo (usuarios_perfil.mantenimiento_rol) y los artículos de todos los depósitos se veían juntos.
--
--   * usuarios_depositos.rol: el rol en ese depósito. usuarios_perfil.mantenimiento_rol queda como resumen que mantiene la base (admin si
--     administra alguno, comun si tiene alguno, nada si ninguno), así lo que lo lee sigue andando; se retira más adelante.
--   * El depósito en el que está la persona (deposito_actual()): el que eligió en el selector (la app lo manda en app.deposito), si no el
--     marcado con la estrellita (depositos_preferidos), si no el principal, si no el primero de los suyos. Los dueños tienen todos.
--   * Los artículos, sus movimientos, los retiros y los ajustes se ven y se cambian solo en el depósito en el que se está. Lo de todos los
--     depósitos (familias, sectores, reparaciones) lo cambia quien administra alguno, como hasta ahora.
--   * Mantenimiento sigue viendo el stock de los repuestos de todos los depósitos de la persona (sus funciones no cambian).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------
-- 1) El rol en cada depósito y el depósito marcado para abrir al entrar
-- ---------------------------------------------------------------------------------------------
alter table public.usuarios_depositos add column if not exists rol text not null default 'comun' check (rol in ('comun', 'admin'));
update public.usuarios_depositos ud set rol = up.mantenimiento_rol
from public.usuarios_perfil up where up.id = ud.usuario_id and up.mantenimiento_rol in ('comun', 'admin');

create table public.depositos_preferidos (
  usuario_id uuid not null references public.usuarios_perfil (id) on delete cascade,
  deposito_id uuid not null references public.depositos (id) on delete cascade
);
select public._de_empresa('public.depositos_preferidos'::regclass);
alter table public.depositos_preferidos add constraint depositos_preferidos_pkey primary key (empresa_id, usuario_id);
create index depositos_preferidos_deposito_idx on public.depositos_preferidos (empresa_id, deposito_id);
revoke all on public.depositos_preferidos from anon;
revoke insert, update, delete, truncate, references, trigger on public.depositos_preferidos from authenticated;
create policy depositos_preferidos_select on public.depositos_preferidos for select to authenticated using (usuario_id = (select auth.uid()));
create policy requiere_usuario_activo on public.depositos_preferidos as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));
create policy bloqueo_modulo on public.depositos_preferidos as restrictive for all to public
  using ((select public.modulo_activo('deposito'))) with check ((select public.modulo_activo('deposito')));

-- ---------------------------------------------------------------------------------------------
-- 2) Qué depósitos tiene la persona, con qué rol, y en cuál está
-- ---------------------------------------------------------------------------------------------
create or replace function public.mis_depositos()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id order by d.codigo), '{}') from public.depositos d
  where d.activo and ((select public.is_owner())
    or exists (select 1 from public.usuarios_depositos ud join public.usuarios_perfil up on up.id = ud.usuario_id and up.activo is true
               where ud.usuario_id = (select auth.uid()) and ud.deposito_id = d.id))
$$;

create or replace function public.rol_en_deposito(p_deposito uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_deposito is null or not (p_deposito = any (public.mis_depositos())) then null
    when (select public.is_owner()) then 'admin'
    else (select ud.rol from public.usuarios_depositos ud where ud.usuario_id = (select auth.uid()) and ud.deposito_id = p_deposito)
  end
$$;

create or replace function public.deposito_actual()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_mis uuid[] := public.mis_depositos();
  v_pedido text := current_setting('app.deposito', true);
  v uuid;
begin
  if cardinality(v_mis) = 0 then return null; end if;
  if v_pedido ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and v_pedido::uuid = any (v_mis) then return v_pedido::uuid; end if;
  select deposito_id into v from public.depositos_preferidos where usuario_id = auth.uid();
  if v = any (v_mis) then return v; end if;
  select id into v from public.depositos where es_principal and id = any (v_mis);
  return coalesce(v, v_mis[1]);
end $$;

create or replace function public.administra_deposito_actual()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.rol_en_deposito(public.deposito_actual()) = 'admin', false)
$$;

-- "Administra el Depósito" / "tiene el Depósito": en algún depósito (para lo que es de todos: familias, sectores, reparaciones...).
create or replace function public.is_mantenimiento_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select (select public.is_owner()) or exists (
    select 1 from public.usuarios_depositos ud
    join public.usuarios_perfil up on up.id = ud.usuario_id and up.activo is true
    join public.depositos d on d.id = ud.deposito_id and d.activo
    where ud.usuario_id = (select auth.uid()) and ud.rol = 'admin')
$$;

create or replace function public.tiene_acceso_mantenimiento()
returns boolean language sql stable security definer set search_path = public as $$
  select cardinality(public.mis_depositos()) > 0
$$;

-- El valor por defecto de los artículos, retiros y ajustes nuevos: el depósito en el que se está (sin sesión, el principal).
create or replace function public.deposito_para_lo_nuevo()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(public.deposito_actual(), public.deposito_principal())
$$;

create or replace function public.deposito_por_defecto_del_usuario()
returns uuid language sql stable security definer set search_path = public as $$
  select public.deposito_actual()
$$;

-- Ajustar el inventario: el permiso de la persona, en un depósito que administra (el que está viendo).
create or replace function public.can_ajustar_inventario()
returns boolean language sql stable security definer set search_path = public as $$
  select (select public.is_owner()) or (
    exists (select 1 from public.usuarios_perfil where id = (select auth.uid()) and activo is true and puede_ajustar_inventario is true)
    and public.administra_deposito_actual())
$$;

-- ---------------------------------------------------------------------------------------------
-- 3) El resumen en el perfil (mantenimiento_rol) lo mantiene la base
-- ---------------------------------------------------------------------------------------------
create or replace function public.usuarios_depositos_resumir_rol()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_usuario uuid := coalesce(new.usuario_id, old.usuario_id);
  v_rol text;
begin
  select case when bool_or(rol = 'admin') then 'admin' when count(*) > 0 then 'comun' end into v_rol
  from public.usuarios_depositos where usuario_id = v_usuario;
  perform set_config('app.rol_derivado', 'on', true);
  update public.usuarios_perfil set mantenimiento_rol = v_rol where id = v_usuario and mantenimiento_rol is distinct from v_rol;
  perform set_config('app.rol_derivado', 'off', true);
  return null;
end $$;
create trigger trg_usuarios_depositos_resumir_rol after insert or update or delete on public.usuarios_depositos
  for each row execute function public.usuarios_depositos_resumir_rol();

-- (el resumen lo cambia la base aunque no lo haga un dueño: por ejemplo, al borrar un depósito)
create or replace function public.proteger_campos_privilegiados()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if current_setting('app.rol_derivado', true) = 'on' and pg_trigger_depth() > 1 then
    return new;
  end if;

  if not is_owner() then
    if (new.rol, new.mantenimiento_rol, new.rol_equipos, new.puede_ver_retiros, new.puede_ver_errores,
        new.puede_resetear_contrasenas, new.puede_ver_sugerencias, new.puede_ajustar_inventario, new.puede_gestionar_depositos, new.puede_ver_auditoria,
        new.puede_ver_informe, new.activo, new.es_owner, new.access_status, new.access_expires_at, new.email)
       is distinct from
       (old.rol, old.mantenimiento_rol, old.rol_equipos, old.puede_ver_retiros, old.puede_ver_errores,
        old.puede_resetear_contrasenas, old.puede_ver_sugerencias, old.puede_ajustar_inventario, old.puede_gestionar_depositos, old.puede_ver_auditoria,
        old.puede_ver_informe, old.activo, old.es_owner, old.access_status, old.access_expires_at, old.email) then
      raise exception 'No tenés permiso para cambiar roles ni permisos.';
    end if;
  end if;

  -- A un dueño no se lo puede bloquear: primero hay que sacarle el cargo.
  if new.es_owner and new.activo is not true then
    raise exception 'No se puede bloquear a un dueño del sistema. Quitale primero el cargo de dueño.';
  end if;

  return new;
end $$;

-- Quien se crea con un rol en el Depósito (sin lista) queda en el principal, con ese rol.
create or replace function public.usuarios_perfil_deposito_inicial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.mantenimiento_rol is not null and not exists (select 1 from public.usuarios_depositos where usuario_id = new.id) then
    insert into public.usuarios_depositos (usuario_id, deposito_id, rol) values (new.id, public.deposito_principal(), new.mantenimiento_rol) on conflict do nothing;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 4) Guardar la lista de una persona (solo un dueño) y marcar el depósito que se abre al entrar (cada uno el suyo)
-- ---------------------------------------------------------------------------------------------
-- p_lista: [{deposito_id, rol}]. Lo que no está en la lista se le quita.
create or replace function public.guardar_depositos_de_usuario(p_usuario uuid, p_lista jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lista jsonb := coalesce(p_lista, '[]');
begin
  perform public.exigir_modulo('deposito');
  if not (select public.is_owner()) then raise exception 'Solo un dueño puede cambiar los permisos.'; end if;
  if jsonb_typeof(v_lista) <> 'array' then raise exception 'Lista no válida.'; end if;
  if not exists (select 1 from public.usuarios_perfil where id = p_usuario) then raise exception 'No se encontró el usuario.'; end if;
  if exists (select 1 from public.usuarios_perfil where id = p_usuario and es_owner) then raise exception 'Un dueño tiene todos los permisos: no lleva lista.'; end if;
  if exists (select 1 from jsonb_array_elements(v_lista) x where coalesce(x ->> 'rol', '') not in ('comun', 'admin')) then raise exception 'Rol no válido.'; end if;
  if exists (select 1 from jsonb_array_elements(v_lista) x
             where coalesce(x ->> 'deposito_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                or not exists (select 1 from public.depositos d where d.id = (x ->> 'deposito_id')::uuid)) then
    raise exception 'Ese depósito no existe.';
  end if;
  if (select count(distinct x ->> 'deposito_id') from jsonb_array_elements(v_lista) x) <> jsonb_array_length(v_lista) then
    raise exception 'Un depósito figura dos veces.';
  end if;
  -- (primero lo que se agrega y lo que cambia, después lo que se quita: así nunca queda un momento sin ningún acceso)
  insert into public.usuarios_depositos (usuario_id, deposito_id, rol)
  select p_usuario, (x ->> 'deposito_id')::uuid, x ->> 'rol' from jsonb_array_elements(v_lista) x
  where not exists (select 1 from public.usuarios_depositos ud where ud.usuario_id = p_usuario and ud.deposito_id = (x ->> 'deposito_id')::uuid);
  update public.usuarios_depositos ud set rol = x ->> 'rol'
  from jsonb_array_elements(v_lista) x
  where ud.usuario_id = p_usuario and ud.deposito_id = (x ->> 'deposito_id')::uuid and ud.rol is distinct from x ->> 'rol';
  delete from public.usuarios_depositos ud
  where ud.usuario_id = p_usuario and not exists (select 1 from jsonb_array_elements(v_lista) x where (x ->> 'deposito_id')::uuid = ud.deposito_id);
end $$;

-- null = sin marcar (se abre el principal).
create or replace function public.marcar_deposito_preferido(p_deposito uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_modulo('deposito');
  if p_deposito is null then
    delete from public.depositos_preferidos where usuario_id = auth.uid();
    return;
  end if;
  if not (p_deposito = any (public.mis_depositos())) then raise exception 'No tenés acceso a ese depósito.'; end if;
  delete from public.depositos_preferidos where usuario_id = auth.uid();
  insert into public.depositos_preferidos (usuario_id, deposito_id) values (auth.uid(), p_deposito);
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5) Retiros y ajustes, de un depósito
-- ---------------------------------------------------------------------------------------------
-- Lo que ya estaba se anota en el depósito de sus artículos (sin artículos, en el principal de su empresa). Retiros y ajustes están
-- protegidos contra cambios (y cada cambio se audita): mientras se completa este dato nuevo, esos disparadores se apagan.
alter table public.retiros add column if not exists deposito_id uuid references public.depositos (id) on delete restrict;
alter table public.retiros disable trigger user;
update public.retiros r set deposito_id = coalesce(
  (select i.deposito_id from public.retiro_items ri join public.items i on i.id = ri.item_id where ri.retiro_id = r.id limit 1),
  (select d.id from public.depositos d where d.es_principal and d.empresa_id = r.empresa_id))
where r.deposito_id is null;
alter table public.retiros enable trigger user;
alter table public.retiros alter column deposito_id set default public.deposito_para_lo_nuevo();
alter table public.retiros alter column deposito_id set not null;
create index retiros_deposito_idx on public.retiros (empresa_id, deposito_id, created_at desc);

alter table public.ajustes_inventario add column if not exists deposito_id uuid references public.depositos (id) on delete restrict;
alter table public.ajustes_inventario disable trigger user;
update public.ajustes_inventario a set deposito_id = coalesce(
  (select i.deposito_id from public.ajuste_items ai join public.items i on i.id = ai.item_id where ai.ajuste_id = a.id limit 1),
  (select d.id from public.depositos d where d.es_principal and d.empresa_id = a.empresa_id))
where a.deposito_id is null;
alter table public.ajustes_inventario enable trigger user;
alter table public.ajustes_inventario alter column deposito_id set default public.deposito_para_lo_nuevo();
alter table public.ajustes_inventario alter column deposito_id set not null;
create index ajustes_inventario_deposito_idx on public.ajustes_inventario (empresa_id, deposito_id, created_at desc);

alter table public.items alter column deposito_id set default public.deposito_para_lo_nuevo();

-- Un ajuste o una carga es de un solo depósito: el de sus artículos.
create or replace function public.registrar_movimiento_stock(p_clase text, p_fecha date, p_motivo text, p_referencia text, p_observaciones text, p_lineas jsonb, p_usuario uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_numero bigint;
  v_emisor jsonb;
  v_linea jsonb;
  v_tipo text;
  v_cantidad numeric;
  v_item uuid;
  v_depositos uuid[];
begin
  select jsonb_strip_nulls(jsonb_build_object(
           'nombre', empresa_nombre, 'razon_social', empresa_razon_social, 'cuit', empresa_cuit,
           'direccion', empresa_direccion, 'telefono', empresa_telefono, 'email', empresa_email, 'web', empresa_web))
    into v_emisor from public.configuracion where id = 1;

  select coalesce(array_agg(distinct i.deposito_id), '{}') into v_depositos
  from jsonb_array_elements(p_lineas) l join public.items i on i.id::text = l ->> 'item_id';
  if cardinality(v_depositos) > 1 then raise exception 'Todos los artículos tienen que ser del mismo depósito.'; end if;

  v_numero := public.siguiente_numero(case p_clase when 'carga' then 'CAR' else 'AJU' end, 1);

  insert into public.ajustes_inventario (usuario_id, motivo, clase, fecha, referencia, observaciones, punto_venta, numero, emisor, deposito_id)
  values (p_usuario, btrim(p_motivo), p_clase, coalesce(p_fecha, public.hoy_local()), nullif(btrim(p_referencia), ''), nullif(btrim(p_observaciones), ''), 1, v_numero, v_emisor,
          coalesce(v_depositos[1], public.deposito_para_lo_nuevo()))
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
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6) Las reglas: cada uno ve y cambia lo del depósito en el que está
-- ---------------------------------------------------------------------------------------------
drop policy if exists items_select on public.items;
drop policy if exists items_insert on public.items;
drop policy if exists items_update on public.items;
create policy items_select on public.items for select to authenticated using (deposito_id = (select public.deposito_actual()));
create policy items_insert on public.items for insert to authenticated
  with check (deposito_id = (select public.deposito_actual()) and (select public.administra_deposito_actual()));
create policy items_update on public.items for update to authenticated
  using (deposito_id = (select public.deposito_actual())) with check (deposito_id = (select public.deposito_actual()));

drop policy if exists movimientos_stock_select on public.movimientos_stock;
create policy movimientos_stock_select on public.movimientos_stock for select to authenticated using (deposito_id = (select public.deposito_actual()));

drop policy if exists depositos_select on public.depositos;
create policy depositos_select on public.depositos for select to authenticated
  using (id = any ((select public.mis_depositos())::uuid[]) or (select public.can_gestionar_depositos()));

drop policy if exists retiros_select on public.retiros;
drop policy if exists retiros_insert on public.retiros;
drop policy if exists retiros_update on public.retiros;
create policy retiros_select on public.retiros for select to authenticated
  using ((usuario_id = (select auth.uid()) or (select public.can_view_all_retiros())) and deposito_id = (select public.deposito_actual()));
create policy retiros_insert on public.retiros for insert to authenticated
  with check (usuario_id = (select auth.uid()) and deposito_id = (select public.deposito_actual()));
create policy retiros_update on public.retiros for update to authenticated
  using ((select public.can_view_all_retiros()) and deposito_id = (select public.deposito_actual()))
  with check ((select public.can_view_all_retiros()) and deposito_id = (select public.deposito_actual()));

-- se retira solo lo del depósito en el que se está (la regla de items deja ver solo esos)
drop policy if exists retiro_items_insert on public.retiro_items;
create policy retiro_items_insert on public.retiro_items for insert to authenticated
  with check (
    exists (select 1 from public.retiros r where r.id = retiro_items.retiro_id and r.usuario_id = (select auth.uid()) and r.created_at > now() - interval '5 minutes')
    and exists (select 1 from public.items i where i.id = retiro_items.item_id));

drop policy if exists ajustes_select on public.ajustes_inventario;
create policy ajustes_select on public.ajustes_inventario for select to authenticated
  using ((select public.can_ajustar_inventario()) and deposito_id = (select public.deposito_actual()));

-- ---------------------------------------------------------------------------------------------
-- 7) Las funciones del Depósito: lo del depósito en el que se está, y administrarlo es tener ese rol ahí
-- ---------------------------------------------------------------------------------------------
-- El buscador y el informe de reposición: solo lo del depósito en el que se está (Compras sin depósitos propios ve el informe de todos).
do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.buscar_repuestos(text,integer,uuid,uuid)'::regprocedure);
  d := replace(d, $x$v_filtros text := '';$x$, $x$v_filtros text := ' and i.deposito_id = public.deposito_actual()';$x$);
  if position('deposito_actual' in d) = 0 then raise exception 'buscar_repuestos: no se pudo filtrar por depósito'; end if;
  execute d;

  d := pg_get_functiondef('public.repuestos_a_reponer(text,uuid,text,integer)'::regprocedure);
  d := replace(d, 'where i.activo and i.stock_minimo > 0',
    'where i.activo and (i.deposito_id = public.deposito_actual() or (public.deposito_actual() is null and public.can_gestionar_depositos())) and i.stock_minimo > 0');
  if position('deposito_actual' in d) = 0 then raise exception 'repuestos_a_reponer: no se pudo filtrar por depósito'; end if;
  execute d;

  -- crear un repuesto: en un depósito que administra
  d := pg_get_functiondef('public.crear_repuesto(uuid,uuid,text,text,text,numeric,numeric,numeric,text,text,uuid,text)'::regprocedure);
  d := replace(d, 'if v_dep is null or v_dep not in (select public.depositos_del_usuario()) then',
                  'if v_dep is null or public.rol_en_deposito(v_dep) is distinct from ''admin'' then');
  if position('rol_en_deposito' in d) = 0 then raise exception 'crear_repuesto: no se pudo cambiar'; end if;
  execute d;

  -- cambiar los datos de un artículo (no las fotos): quien administra su depósito. El depósito de un artículo no se cambia.
  d := pg_get_functiondef('public.items_trg_fotos_pendientes()'::regprocedure);
  d := replace(d, 'v_admin boolean := is_mantenimiento_admin();', 'v_admin boolean := public.rol_en_deposito(OLD.deposito_id) = ''admin'';');
  d := replace(d, 'NEW.ubicacion, NEW.stock, NEW.detalles, NEW.palabras_clave, NEW.activo)', 'NEW.ubicacion, NEW.stock, NEW.detalles, NEW.palabras_clave, NEW.activo, NEW.deposito_id)');
  d := replace(d, 'OLD.ubicacion, OLD.stock, OLD.detalles, OLD.palabras_clave, OLD.activo)', 'OLD.ubicacion, OLD.stock, OLD.detalles, OLD.palabras_clave, OLD.activo, OLD.deposito_id)');
  if position('rol_en_deposito' in d) = 0 or position('NEW.deposito_id' in d) = 0 then raise exception 'items_trg_fotos_pendientes: no se pudo cambiar'; end if;
  execute d;

  -- cargar o ajustar: los artículos del depósito en el que se está
  d := pg_get_functiondef('public.crear_movimiento_stock(text,date,text,text,text,jsonb)'::regprocedure);
  d := replace(d, $x$if p_clase is null or p_clase not in ('carga', 'ajuste') then$x$,
    $x$if p_lineas is not null and jsonb_typeof(p_lineas) = 'array' and exists (
       select 1 from jsonb_array_elements(p_lineas) l left join public.items i on i.id::text = l.value ->> 'item_id'
       where i.id is null or i.deposito_id is distinct from public.deposito_actual()) then
    raise exception 'Todos los artículos tienen que ser del depósito en el que estás.';
  end if;
  if p_clase is null or p_clase not in ('carga', 'ajuste') then$x$);
  if position('deposito_actual' in d) = 0 then raise exception 'crear_movimiento_stock: no se pudo cambiar'; end if;
  execute d;
end $$;

create or replace function public.repuestos_con_palabra(p_palabra text, p_max integer default null)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
declare
  v_raiz text := public.patron_de_busqueda(public.raiz_de_palabra(public.texto_de_busqueda(p_palabra)));
  v_cod text := public.patron_de_busqueda(lower(p_palabra));
  v_regex text;
  v_dep uuid := public.deposito_actual();
begin
  perform public.exigir_modulo('deposito');
  -- la usan las listas del Depósito (retiros, movimientos): lo del depósito en el que se está.
  if not public.usuario_activo() or v_dep is null then
    raise exception 'No autorizado';
  end if;
  if p_palabra ~ '[0-9]+$' then
    v_regex := regexp_replace(regexp_replace(p_palabra, '[0-9]+$', ''), '([][\\.^$|?*+(){}])', '\\\1', 'g')
               || '0*' || coalesce(nullif(ltrim((regexp_match(p_palabra, '([0-9]+)$'))[1], '0'), ''), '0') || '$';
  end if;
  return query
    select i.id from public.items i
    where i.deposito_id = v_dep
      and (i.codigo ilike v_cod
       or public.texto_de_busqueda(i.descripcion) like v_raiz
       or public.texto_de_busqueda(i.palabras_clave) like v_raiz
       or (v_regex is not null and i.codigo ~* v_regex))
    limit case when p_max is null then null else p_max + 1 end;
end $$;

-- Importar stock desde Excel: al depósito en el que se está, si lo administra (un código que es de otro depósito no se toca).
create or replace function public.aplicar_importacion_stock(p_filas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lineas jsonb;
  v_total integer;
  v_partes integer;
  v_parte integer := 0;
  v_documentos jsonb := '[]'::jsonb;
  v_id uuid;
  v_desde integer;
  v_dep uuid := public.deposito_actual();
begin
  perform public.exigir_modulo('deposito');
  if v_dep is null or not public.administra_deposito_actual() or not public.can_ajustar_inventario() then
    raise exception 'No autorizado: importar stock requiere ser administrador del depósito con permiso para ajustar el inventario.';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('documentos', v_documentos);
  end if;

  -- 1) datos de los repuestos (sin tocar el stock), siempre en el mismo orden
  insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, stock_minimo, punto_pedido, deposito_id)
  select f.codigo, f.numero, f.descripcion, f.familia_id, f.subfamilia_id, coalesce(f.stock_minimo, 0), coalesce(f.punto_pedido, 0), v_dep
  from jsonb_to_recordset(p_filas) as f(codigo text, numero text, descripcion text, familia_id uuid, subfamilia_id uuid, stock numeric, stock_minimo numeric, punto_pedido numeric)
  order by f.codigo
  on conflict (empresa_id, codigo) do update
    set descripcion = excluded.descripcion, numero = excluded.numero, familia_id = excluded.familia_id, subfamilia_id = excluded.subfamilia_id,
        stock_minimo = excluded.stock_minimo, punto_pedido = excluded.punto_pedido
    where items.deposito_id = v_dep;

  -- 2) las diferencias de stock, como líneas de ajuste
  select coalesce(jsonb_agg(jsonb_build_object('item_id', x.id, 'tipo', case when x.delta > 0 then 'suma' else 'resta' end, 'cantidad', abs(x.delta)) order by x.id), '[]'::jsonb)
    into v_lineas
  from (
    select i.id, f.stock - coalesce(i.stock, 0) as delta
    from jsonb_to_recordset(p_filas) as f(codigo text, stock numeric)
    join public.items i on i.codigo = f.codigo and i.deposito_id = v_dep
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
end $$;

do $$
declare
  f text;
begin
  foreach f in array array['public.usuarios_depositos_resumir_rol()', 'public.deposito_para_lo_nuevo()'] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
  execute 'grant execute on function public.deposito_para_lo_nuevo() to authenticated, service_role';
  foreach f in array array['public.mis_depositos()', 'public.rol_en_deposito(uuid)', 'public.deposito_actual()', 'public.administra_deposito_actual()',
                           'public.guardar_depositos_de_usuario(uuid, jsonb)', 'public.marcar_deposito_preferido(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

select public._vinculos_por_empresa();
select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
