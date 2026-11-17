-- Permisos por depósito (ver abastecimiento/…004100_permisos_por_deposito.sql): el faltante de una OT lo da por revisado quien administra
-- el depósito de ese repuesto (antes, quien administraba "el Depósito", que era uno solo).

set check_function_bodies = off;

create or replace function public.revisar_faltante(p_linea uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_modulo('mantenimiento');
  perform set_config('app.cerrando_ot', 'on', true);
  update public.ot_repuestos r set faltante_revisado_por = auth.uid(), faltante_revisado_at = now()
  where r.id = p_linea and r.faltante > 0 and r.faltante_revisado_at is null
    and exists (select 1 from public.items i where i.id = r.item_id and public.rol_en_deposito(i.deposito_id) = 'admin');
  if not found then raise exception 'No se encontró el faltante, o no administrás el depósito de ese repuesto.'; end if;
  perform set_config('app.cerrando_ot', 'off', true);
end $$;

select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
