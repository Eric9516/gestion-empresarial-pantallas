-- Borrar un depósito (pedido del encargado, 06/11/2026): solo un dueño, nunca el principal y solo si no tiene historia (ningún artículo,
-- movimiento de stock, retiro, ajuste ni reparación, ni siquiera dados de baja). Con historia se desactiva: así nunca se pierden registros.
-- Se van con él sus familias y subfamilias (vacías), su planilla de familias, los permisos que alguien tuviera en él y la estrellita.

set check_function_bodies = off;

-- Por qué no se puede borrar (null = se puede): lo usa la lista de depósitos para mostrar el botón o el motivo.
create or replace function public.motivo_para_no_borrar_deposito(p_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not exists (select 1 from public.depositos where id = p_id) then 'Ese depósito no existe.'
    when (select es_principal from public.depositos where id = p_id) then 'Es el depósito principal: no se puede borrar.'
    when exists (select 1 from public.items where deposito_id = p_id)
      or exists (select 1 from public.movimientos_stock where deposito_id = p_id)
      or exists (select 1 from public.retiros where deposito_id = p_id)
      or exists (select 1 from public.ajustes_inventario where deposito_id = p_id)
      or exists (select 1 from public.reparaciones where deposito_id = p_id)
      then 'Tiene historial (artículos, movimientos, retiros o reparaciones): desactivalo en su lugar.'
  end
$$;

create or replace function public.borrar_deposito(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_motivo text;
begin
  perform public.exigir_modulo('deposito');
  if not (select public.is_owner()) then raise exception 'Solo un dueño puede borrar depósitos.'; end if;
  -- (se traba el depósito: que nadie cargue algo en él mientras se borra)
  perform 1 from public.depositos where id = p_id for update;
  v_motivo := public.motivo_para_no_borrar_deposito(p_id);
  if v_motivo is not null then raise exception '%', v_motivo; end if;
  delete from public.subfamilias s using public.familias f where f.id = s.familia_id and f.deposito_id = p_id;
  delete from public.familias where deposito_id = p_id;
  delete from public.depositos where id = p_id;
end $$;

do $$
declare
  f text;
begin
  foreach f in array array['public.motivo_para_no_borrar_deposito(uuid)', 'public.borrar_deposito(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
