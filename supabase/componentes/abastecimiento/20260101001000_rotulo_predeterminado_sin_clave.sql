-- Parte "abastecimiento" de supabase/migrations/20260101001000_rotulo_predeterminado_sin_clave.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- E1a: la Base no debe depender de Abastecimiento.
--
-- La configuración de la empresa (Base, siempre instalada) guardaba una clave que apuntaba a la tabla de diseños de rótulo
-- (que es de Abastecimiento). Si un cliente no tiene Abastecimiento, esa tabla no existiría y la clave no se podría crear.
-- Se saca la clave y se conserva el MISMO comportamiento con dos disparadores que viven del lado de Abastecimiento:
--   * al borrar un diseño, si era el predeterminado, la configuración queda sin predeterminado (antes: ON DELETE SET NULL);
--   * no se puede elegir como predeterminado un diseño que no existe (antes: lo impedía la clave).

alter table public.configuracion drop constraint if exists configuracion_rotulo_diseno_id_fkey;

create or replace function public.rotulo_disenos_limpiar_predeterminado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.configuracion set rotulo_diseno_id = null where rotulo_diseno_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_rotulo_disenos_limpiar_predeterminado on public.rotulo_disenos;

create trigger trg_rotulo_disenos_limpiar_predeterminado
  after delete on public.rotulo_disenos
  for each row execute function public.rotulo_disenos_limpiar_predeterminado();

create or replace function public.configuracion_validar_rotulo_diseno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.rotulo_diseno_id is not null
     and not exists (select 1 from public.rotulo_disenos where id = new.rotulo_diseno_id) then
    raise exception 'El diseño de rótulo elegido no existe.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger trg_configuracion_validar_rotulo_diseno
  before insert or update of rotulo_diseno_id on public.configuracion
  for each row execute function public.configuracion_validar_rotulo_diseno();
