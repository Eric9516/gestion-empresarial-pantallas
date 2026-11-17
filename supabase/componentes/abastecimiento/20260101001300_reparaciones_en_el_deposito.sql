-- Las reparaciones pasan al Depósito (componente Abastecimiento); dejan de ser del módulo "mantenimiento".
--
-- Una reparación es lo que se manda a reparar afuera: un proveedor (el taller), repuestos del depósito y un envío. No usa los equipos.
-- Por eso la bloquea la licencia de "deposito" y "proveedores", y no la de "mantenimiento" (que queda para los equipos y lo que se agregue después).
--
-- Para las bases que ya tenían las reparaciones atadas al módulo "mantenimiento" (como Cremac). En una instalación nueva las reglas
-- ya salen así de la parte "abastecimiento" y esta migración vuelve a dejarlas igual. Si la base no tiene la tabla, no hace nada con las reglas.

set check_function_bodies = off;

do $$
begin
  if to_regclass('public.reparaciones') is null or to_regclass('public.reparacion_items') is null or to_regclass('public.reparacion_entregas') is null then
    return;
  end if;
    drop policy if exists bloqueo_modulo on public.reparaciones;
    create policy bloqueo_modulo on public.reparaciones as restrictive for all to public
      using (public.modulo_activo('deposito') and public.modulo_activo('proveedores')) with check (public.modulo_activo('deposito') and public.modulo_activo('proveedores'));
    drop policy if exists bloqueo_modulo on public.reparacion_items;
    create policy bloqueo_modulo on public.reparacion_items as restrictive for all to public
      using (public.modulo_activo('deposito') and public.modulo_activo('proveedores')) with check (public.modulo_activo('deposito') and public.modulo_activo('proveedores'));
    drop policy if exists bloqueo_modulo on public.reparacion_entregas;
    create policy bloqueo_modulo on public.reparacion_entregas as restrictive for all to public
      using (public.modulo_activo('deposito') and public.modulo_activo('proveedores')) with check (public.modulo_activo('deposito') and public.modulo_activo('proveedores'));
end
$$;

-- Las funciones que se saltan las reglas de tabla llevan la misma guarda (el resto del cuerpo no cambia).
CREATE OR REPLACE FUNCTION public.crear_reparacion(p_proveedor_id uuid, p_motivo text, p_fecha_salida date, p_envio_id uuid, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reparacion_id uuid;
  v_item jsonb;
begin
  PERFORM public.exigir_modulo('deposito', 'proveedores');
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un artículo';
  end if;

  insert into reparaciones (proveedor_id, motivo, fecha_salida, responsable_id, envio_id)
  values (p_proveedor_id, p_motivo, p_fecha_salida, auth.uid(), p_envio_id)
  returning id into v_reparacion_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into reparacion_items (reparacion_id, item_id, cantidad, descuenta_stock)
    values (v_reparacion_id, (v_item->>'item_id')::uuid, (v_item->>'cantidad')::numeric, coalesce((v_item->>'descuenta_stock')::boolean, true));
  end loop;

  return v_reparacion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_reparacion(p_reparacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_linea record;
  v_pendiente numeric;
begin
  PERFORM public.exigir_modulo('deposito', 'proveedores');
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;

  for v_linea in select id, item_id from reparacion_items where reparacion_id = p_reparacion_id and descuenta_stock loop
    v_pendiente := reparacion_item_pendiente(v_linea.id);
    if v_pendiente > 0 then
      update items set stock = coalesce(stock, 0) + v_pendiente where id = v_linea.item_id;
    end if;
  end loop;

  update reparaciones set activo = false, eliminado_por = auth.uid(), eliminado_at = now() where id = p_reparacion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restaurar_reparacion(p_reparacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_linea record;
  v_pendiente numeric;
begin
  PERFORM public.exigir_modulo('deposito', 'proveedores');
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;

  for v_linea in select id, item_id from reparacion_items where reparacion_id = p_reparacion_id and descuenta_stock loop
    v_pendiente := reparacion_item_pendiente(v_linea.id);
    if v_pendiente > 0 then
      update items set stock = coalesce(stock, 0) - v_pendiente where id = v_linea.item_id;
    end if;
  end loop;

  update reparaciones set activo = true, eliminado_por = null, eliminado_at = null where id = p_reparacion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reparacion_item_pendiente(p_reparacion_item_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ri.cantidad - coalesce((select sum(re.cantidad_devuelta) from reparacion_entregas re where re.reparacion_item_id = ri.id), 0)
  from reparacion_items ri
  where ri.id = p_reparacion_item_id
    and public.modulo_activo('deposito') and public.modulo_activo('proveedores') and public.usuario_activo();
$function$;

revoke execute on function public.crear_reparacion(uuid, text, date, uuid, jsonb), public.eliminar_reparacion(uuid), public.restaurar_reparacion(uuid), public.reparacion_item_pendiente(uuid) from public, anon;
