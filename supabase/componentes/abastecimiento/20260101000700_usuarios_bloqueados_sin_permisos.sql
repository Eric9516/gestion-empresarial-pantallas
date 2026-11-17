-- Parte "abastecimiento" de supabase/migrations/20260101000700_usuarios_bloqueados_sin_permisos.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

CREATE OR REPLACE FUNCTION public.historial_retiros_por_item(p_item_id uuid)
 RETURNS TABLE(id uuid, cantidad numeric, observacion text, created_at timestamp with time zone, usuario_id uuid, sector text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ri.id, ri.cantidad, ri.observacion, r.created_at, r.usuario_id, s.nombre as sector
  from retiro_items ri
  join retiros r on r.id = ri.retiro_id
  left join sectores s on s.id = r.sector_id
  where ri.item_id = p_item_id
    and public.modulo_activo('deposito')
    and exists (
      select 1 from usuarios_perfil up
      where up.id = auth.uid() and up.activo is true and (up.mantenimiento_rol is not null or is_owner())
    )
  order by r.created_at desc;
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

-- Una regla más por tabla: sin usuario activo no se lee ni se escribe nada. Se suma a las que ya había
-- (las reglas "restrictivas" se combinan con "y"). Solo se exceptúan la configuración (la lee el ingreso), la licencia
-- y los perfiles, que tienen su propia regla de abajo.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
      and c.relname = any (array['proveedores', 'contactos', 'comisionistas', 'rotulos_generados', 'rotulos_bultos', 'rotulos_fotos', 'rotulo_disenos', 'items', 'familias', 'subfamilias', 'planilla_familias', 'item_proveedores', 'retiros', 'retiro_items', 'ajustes_inventario', 'ajuste_items', 'sectores', 'reparaciones', 'reparacion_items', 'reparacion_entregas'])
      and c.relname not in ('configuracion', 'licencia', 'usuarios_perfil', 'migraciones_aplicadas')
  loop
    execute format('drop policy if exists requiere_usuario_activo on public.%I', t);
    execute format(
      'create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
end $$;
