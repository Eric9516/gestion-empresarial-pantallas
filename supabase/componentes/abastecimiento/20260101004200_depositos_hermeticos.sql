-- Cada depósito es hermético (decisión del encargado, 05/11/2026): tiene sus propias familias y subfamilias, su planilla de familias y sus
-- reparaciones; lo que pasa de uno a otro va por solicitudes o requerimientos. Se ven y se cambian las del depósito en el que se está
-- (public.deposito_actual(), ver …004100_permisos_por_deposito.sql). Los sectores (a dónde va lo que se retira) siguen siendo de la empresa.
--
-- Lo que ya estaba: las familias quedan en el depósito principal de su empresa; si un artículo de otro depósito usaba una, ese depósito
-- recibe su propia copia (con sus subfamilias) y el artículo pasa a usar la copia. Las reparaciones, en el depósito de sus artículos (sin
-- artículos, en el principal).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------
-- 1) Familias y subfamilias de cada depósito
-- ---------------------------------------------------------------------------------------------
alter table public.familias add column if not exists deposito_id uuid references public.depositos (id) on delete restrict;
update public.familias f set deposito_id = (select d.id from public.depositos d where d.es_principal and d.empresa_id = f.empresa_id)
where f.deposito_id is null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'familias_codigo_key' and conrelid = 'public.familias'::regclass) then
    alter table public.familias drop constraint familias_codigo_key;
  else
    drop index if exists public.familias_codigo_key;
  end if;
end $$;
create unique index familias_deposito_codigo_key on public.familias (empresa_id, deposito_id, codigo);

-- las familias que usan artículos de otro depósito: una copia para ese depósito (los artículos se pasan a la copia sin disparar nada:
-- es solo un cambio de a qué familia apuntan, con los mismos códigos)
do $$
declare
  r record;
  v_nueva uuid;
begin
  alter table public.items disable trigger user;
  for r in
    select distinct i.deposito_id, i.familia_id, f.empresa_id
    from public.items i join public.familias f on f.id = i.familia_id
    where i.deposito_id is distinct from f.deposito_id
  loop
    select id into v_nueva from public.familias
    where empresa_id = r.empresa_id and deposito_id = r.deposito_id and codigo = (select codigo from public.familias where id = r.familia_id);
    if v_nueva is null then
      insert into public.familias (empresa_id, deposito_id, codigo, nombre)
      select empresa_id, r.deposito_id, codigo, nombre from public.familias where id = r.familia_id
      returning id into v_nueva;
      insert into public.subfamilias (empresa_id, familia_id, codigo, nombre)
      select empresa_id, v_nueva, codigo, nombre from public.subfamilias where familia_id = r.familia_id;
    end if;
    update public.items i set familia_id = v_nueva,
           subfamilia_id = (select s2.id from public.subfamilias s1 join public.subfamilias s2 on s2.familia_id = v_nueva and s2.codigo = s1.codigo
                            where s1.id = i.subfamilia_id)
    where i.familia_id = r.familia_id and i.deposito_id = r.deposito_id;
  end loop;
  alter table public.items enable trigger user;
end $$;

alter table public.familias alter column deposito_id set default public.deposito_para_lo_nuevo();
alter table public.familias alter column deposito_id set not null;

-- un artículo usa familias de su propio depósito
create or replace function public.items_familia_del_deposito()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.familia_id is not null and (select deposito_id from public.familias where id = new.familia_id) is distinct from new.deposito_id then
    raise exception 'Esa familia es de otro depósito.';
  end if;
  return new;
end $$;
create trigger trg_items_familia_del_deposito before insert or update of familia_id, deposito_id on public.items
  for each row execute function public.items_familia_del_deposito();

drop policy if exists familias_select on public.familias;
drop policy if exists familias_insert on public.familias;
drop policy if exists familias_update on public.familias;
drop policy if exists familias_delete on public.familias;
create policy familias_select on public.familias for select to authenticated using (deposito_id = (select public.deposito_actual()));
create policy familias_insert on public.familias for insert to authenticated
  with check (deposito_id = (select public.deposito_actual()) and (select public.administra_deposito_actual()));
create policy familias_update on public.familias for update to authenticated
  using ((select public.is_owner()) and deposito_id = (select public.deposito_actual()))
  with check ((select public.is_owner()) and deposito_id = (select public.deposito_actual()));
create policy familias_delete on public.familias for delete to authenticated using ((select public.is_owner()) and deposito_id = (select public.deposito_actual()));

-- las subfamilias son de su familia (la regla de familias deja ver solo las del depósito en el que se está)
drop policy if exists subfamilias_select on public.subfamilias;
drop policy if exists subfamilias_insert on public.subfamilias;
drop policy if exists subfamilias_update on public.subfamilias;
drop policy if exists subfamilias_delete on public.subfamilias;
create policy subfamilias_select on public.subfamilias for select to authenticated
  using (exists (select 1 from public.familias f where f.id = subfamilias.familia_id));
create policy subfamilias_insert on public.subfamilias for insert to authenticated
  with check ((select public.administra_deposito_actual()) and exists (select 1 from public.familias f where f.id = subfamilias.familia_id));
create policy subfamilias_update on public.subfamilias for update to authenticated
  using ((select public.is_owner()) and exists (select 1 from public.familias f where f.id = subfamilias.familia_id))
  with check ((select public.is_owner()) and exists (select 1 from public.familias f where f.id = subfamilias.familia_id));
create policy subfamilias_delete on public.subfamilias for delete to authenticated
  using ((select public.is_owner()) and exists (select 1 from public.familias f where f.id = subfamilias.familia_id));

-- la planilla de familias (el Excel que se sube en Configuración): una por depósito
alter table public.planilla_familias add column if not exists deposito_id uuid references public.depositos (id) on delete cascade;
update public.planilla_familias p set deposito_id = (select d.id from public.depositos d where d.es_principal and d.empresa_id = p.empresa_id)
where p.deposito_id is null;
alter table public.planilla_familias alter column deposito_id set default public.deposito_para_lo_nuevo();
alter table public.planilla_familias alter column deposito_id set not null;
alter table public.planilla_familias drop constraint if exists planilla_familias_pkey;
alter table public.planilla_familias add constraint planilla_familias_pkey primary key (empresa_id, deposito_id);
drop policy if exists planilla_familias_select on public.planilla_familias;
drop policy if exists planilla_familias_update on public.planilla_familias;
drop policy if exists planilla_familias_upsert on public.planilla_familias;
create policy planilla_familias_select on public.planilla_familias for select to authenticated using (deposito_id = (select public.deposito_actual()));
create policy planilla_familias_update on public.planilla_familias for update to authenticated
  using ((select public.administra_deposito_actual()) and deposito_id = (select public.deposito_actual()))
  with check ((select public.administra_deposito_actual()) and deposito_id = (select public.deposito_actual()));
create policy planilla_familias_upsert on public.planilla_familias for insert to authenticated
  with check ((select public.administra_deposito_actual()) and deposito_id = (select public.deposito_actual()));

-- ---------------------------------------------------------------------------------------------
-- 2) Reparaciones de cada depósito
-- ---------------------------------------------------------------------------------------------
alter table public.reparaciones add column if not exists deposito_id uuid references public.depositos (id) on delete restrict;
alter table public.reparaciones disable trigger user;
update public.reparaciones r set deposito_id = coalesce(
  (select i.deposito_id from public.reparacion_items ri join public.items i on i.id = ri.item_id where ri.reparacion_id = r.id limit 1),
  (select d.id from public.depositos d where d.es_principal and d.empresa_id = r.empresa_id))
where r.deposito_id is null;
alter table public.reparaciones enable trigger user;
alter table public.reparaciones alter column deposito_id set default public.deposito_para_lo_nuevo();
alter table public.reparaciones alter column deposito_id set not null;
create index reparaciones_deposito_idx on public.reparaciones (empresa_id, deposito_id, created_at desc);

-- lo que se manda a reparar es del depósito de la reparación
create or replace function public.reparacion_items_del_deposito()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.item_id is not null
     and (select deposito_id from public.items where id = new.item_id) is distinct from (select deposito_id from public.reparaciones where id = new.reparacion_id) then
    raise exception 'Ese artículo es de otro depósito.';
  end if;
  return new;
end $$;
create trigger trg_reparacion_items_del_deposito before insert or update of item_id, reparacion_id on public.reparacion_items
  for each row execute function public.reparacion_items_del_deposito();

drop policy if exists reparaciones_select on public.reparaciones;
drop policy if exists reparaciones_insert on public.reparaciones;
drop policy if exists reparaciones_update on public.reparaciones;
drop policy if exists reparaciones_delete on public.reparaciones;
create policy reparaciones_select on public.reparaciones for select to authenticated
  using ((select public.administra_deposito_actual()) and deposito_id = (select public.deposito_actual()));
create policy reparaciones_insert on public.reparaciones for insert to authenticated
  with check ((select public.administra_deposito_actual()) and deposito_id = (select public.deposito_actual()));
create policy reparaciones_update on public.reparaciones for update to authenticated
  using ((select public.administra_deposito_actual()) and deposito_id = (select public.deposito_actual()))
  with check ((select public.administra_deposito_actual()) and deposito_id = (select public.deposito_actual()));
create policy reparaciones_delete on public.reparaciones for delete to authenticated
  using ((select public.is_owner()) and deposito_id = (select public.deposito_actual()));

-- sus líneas y entregas: las de las reparaciones que se ven
drop policy if exists reparacion_items_select on public.reparacion_items;
drop policy if exists reparacion_items_insert on public.reparacion_items;
drop policy if exists reparacion_items_update on public.reparacion_items;
drop policy if exists reparacion_items_delete on public.reparacion_items;
create policy reparacion_items_select on public.reparacion_items for select to authenticated
  using (exists (select 1 from public.reparaciones r where r.id = reparacion_items.reparacion_id));
create policy reparacion_items_insert on public.reparacion_items for insert to authenticated
  with check (exists (select 1 from public.reparaciones r where r.id = reparacion_items.reparacion_id));
create policy reparacion_items_update on public.reparacion_items for update to authenticated
  using (exists (select 1 from public.reparaciones r where r.id = reparacion_items.reparacion_id))
  with check (exists (select 1 from public.reparaciones r where r.id = reparacion_items.reparacion_id));
create policy reparacion_items_delete on public.reparacion_items for delete to authenticated
  using (exists (select 1 from public.reparaciones r where r.id = reparacion_items.reparacion_id));

drop policy if exists reparacion_entregas_select on public.reparacion_entregas;
drop policy if exists reparacion_entregas_insert on public.reparacion_entregas;
drop policy if exists reparacion_entregas_delete on public.reparacion_entregas;
create policy reparacion_entregas_select on public.reparacion_entregas for select to authenticated
  using (exists (select 1 from public.reparacion_items ri where ri.id = reparacion_entregas.reparacion_item_id));
create policy reparacion_entregas_insert on public.reparacion_entregas for insert to authenticated
  with check (exists (select 1 from public.reparacion_items ri where ri.id = reparacion_entregas.reparacion_item_id));
create policy reparacion_entregas_delete on public.reparacion_entregas for delete to authenticated
  using (exists (select 1 from public.reparacion_items ri where ri.id = reparacion_entregas.reparacion_item_id));

-- borrar y restaurar una reparación: quien administra el depósito en el que se está, y solo las de ese depósito
do $$
declare
  d text;
  f text;
begin
  foreach f in array array['public.eliminar_reparacion(uuid)', 'public.restaurar_reparacion(uuid)'] loop
    d := pg_get_functiondef(f::regprocedure);
    d := replace(d, 'if not is_mantenimiento_admin() then',
      'if not public.administra_deposito_actual() or not exists (select 1 from public.reparaciones where id = p_reparacion_id and deposito_id = public.deposito_actual()) then');
    if position('administra_deposito_actual' in d) = 0 then raise exception '%: no se pudo cambiar', f; end if;
    execute d;
  end loop;
end $$;

do $$
declare
  f text;
begin
  foreach f in array array['public.items_familia_del_deposito()', 'public.reparacion_items_del_deposito()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

select public._vinculos_por_empresa();
select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
