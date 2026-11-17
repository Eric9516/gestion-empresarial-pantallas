-- Reglas de seguridad que se calculan una vez por consulta y no una vez por fila (generado por scripts/herramientas/envolver-reglas.mjs).
--
-- Una regla escrita como `using (modulo_activo('deposito'))` o `using (is_owner())` se evaluaba por cada fila que la consulta recorría, y además impedía que
-- Postgres usara los índices de búsqueda de texto de las búsquedas de la app: con 100.000 repuestos, una búsqueda pasaba de 38 ms a 1.471 ms, y crece con la tabla.
-- Escrita como `(select modulo_activo('deposito'))` se calcula una sola vez por consulta y los índices vuelven a servir. Es exactamente la misma regla:
-- quién puede ver o hacer qué no cambia (lo comprueban las pruebas de permisos). Lo mismo para auth.uid().
--
-- Regla de oro para las reglas nuevas: toda llamada a una función de permisos o a auth.uid() va envuelta en (select ...).

alter policy "ajuste_items_select" on public.ajuste_items
  using ((select can_ajustar_inventario()));

alter policy "bloqueo_modulo" on public.ajuste_items
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "ajustes_select" on public.ajustes_inventario
  using ((select can_ajustar_inventario()));

alter policy "bloqueo_modulo" on public.ajustes_inventario
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "bloqueo_modulo" on public.comisionistas
  using ((select modulo_activo('comisionistas'::text)))
  with check ((select modulo_activo('comisionistas'::text)));

alter policy "comisionistas_delete" on public.comisionistas
  using ((select is_directorio_admin()));

alter policy "comisionistas_insert" on public.comisionistas
  with check ((select is_directorio_admin()));

alter policy "comisionistas_update" on public.comisionistas
  using ((select is_directorio_admin()))
  with check ((select is_directorio_admin()));

alter policy "bloqueo_modulo" on public.contactos
  using ((select modulo_activo('proveedores'::text)))
  with check ((select modulo_activo('proveedores'::text)));

alter policy "contactos_delete" on public.contactos
  using ((select is_directorio_admin()));

alter policy "contactos_insert" on public.contactos
  with check ((select is_directorio_admin()));

alter policy "contactos_update" on public.contactos
  using ((select is_directorio_admin()))
  with check ((select is_directorio_admin()));

alter policy "bloqueo_modulo" on public.familias
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "familias_delete" on public.familias
  using ((select is_owner()));

alter policy "familias_insert" on public.familias
  with check ((select is_mantenimiento_admin()));

alter policy "familias_update" on public.familias
  using ((select is_owner()))
  with check ((select is_owner()));

alter policy "bloqueo_modulo" on public.item_proveedores
  using (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))))
  with check (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))));

alter policy "item_proveedores_delete" on public.item_proveedores
  using ((select is_mantenimiento_admin()));

alter policy "item_proveedores_insert" on public.item_proveedores
  with check ((select is_mantenimiento_admin()));

alter policy "item_proveedores_select" on public.item_proveedores
  using ((select is_mantenimiento_admin()));

alter policy "bloqueo_modulo" on public.items
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "items_delete" on public.items
  using ((select is_owner()));

alter policy "items_insert" on public.items
  with check ((select is_mantenimiento_admin()));

alter policy "items_update" on public.items
  using ((select tiene_acceso_mantenimiento()))
  with check ((select tiene_acceso_mantenimiento()));

alter policy "bloqueo_modulo" on public.planilla_familias
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "planilla_familias_update" on public.planilla_familias
  using ((select is_mantenimiento_admin()))
  with check ((select is_mantenimiento_admin()));

alter policy "planilla_familias_upsert" on public.planilla_familias
  with check ((select is_mantenimiento_admin()));

alter policy "bloqueo_modulo" on public.proveedores
  using ((select modulo_activo('proveedores'::text)))
  with check ((select modulo_activo('proveedores'::text)));

alter policy "proveedores_delete" on public.proveedores
  using ((select is_owner()));

alter policy "proveedores_insert" on public.proveedores
  with check ((select is_directorio_admin()));

alter policy "proveedores_update" on public.proveedores
  using ((select is_directorio_admin()))
  with check ((select is_directorio_admin()));

alter policy "bloqueo_modulo" on public.reparacion_entregas
  using (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))))
  with check (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))));

alter policy "reparacion_entregas_delete" on public.reparacion_entregas
  using ((select is_mantenimiento_admin()));

alter policy "reparacion_entregas_insert" on public.reparacion_entregas
  with check ((select is_mantenimiento_admin()));

alter policy "reparacion_entregas_select" on public.reparacion_entregas
  using ((select is_mantenimiento_admin()));

alter policy "bloqueo_modulo" on public.reparacion_items
  using (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))))
  with check (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))));

alter policy "reparacion_items_delete" on public.reparacion_items
  using ((select is_mantenimiento_admin()));

alter policy "reparacion_items_insert" on public.reparacion_items
  with check ((select is_mantenimiento_admin()));

alter policy "reparacion_items_select" on public.reparacion_items
  using ((select is_mantenimiento_admin()));

alter policy "reparacion_items_update" on public.reparacion_items
  using ((select is_mantenimiento_admin()))
  with check ((select is_mantenimiento_admin()));

alter policy "bloqueo_modulo" on public.reparaciones
  using (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))))
  with check (((select modulo_activo('deposito'::text)) AND (select modulo_activo('proveedores'::text))));

alter policy "reparaciones_delete" on public.reparaciones
  using ((select is_owner()));

alter policy "reparaciones_insert" on public.reparaciones
  with check ((select is_mantenimiento_admin()));

alter policy "reparaciones_select" on public.reparaciones
  using ((select is_mantenimiento_admin()));

alter policy "reparaciones_update" on public.reparaciones
  using ((select is_mantenimiento_admin()))
  with check ((select is_mantenimiento_admin()));

alter policy "bloqueo_modulo" on public.retiro_items
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "retiro_items_delete" on public.retiro_items
  using ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND ((select can_view_all_retiros()) OR ((r.usuario_id = (select auth.uid())) AND (r.created_at > (now() - '24:00:00'::interval))))))));

alter policy "retiro_items_insert" on public.retiro_items
  with check ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND (r.usuario_id = (select auth.uid()))))));

alter policy "retiro_items_select" on public.retiro_items
  using ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND ((r.usuario_id = (select auth.uid())) OR (select can_view_all_retiros()))))));

alter policy "retiro_items_update" on public.retiro_items
  using ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND ((select can_view_all_retiros()) OR ((r.usuario_id = (select auth.uid())) AND (r.created_at > (now() - '24:00:00'::interval))))))))
  with check ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND ((select can_view_all_retiros()) OR ((r.usuario_id = (select auth.uid())) AND (r.created_at > (now() - '24:00:00'::interval))))))));

alter policy "bloqueo_modulo" on public.retiros
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "retiros_delete" on public.retiros
  using (((select can_view_all_retiros()) OR ((usuario_id = (select auth.uid())) AND (created_at > (now() - '24:00:00'::interval)))));

alter policy "retiros_insert" on public.retiros
  with check ((usuario_id = (select auth.uid())));

alter policy "retiros_select" on public.retiros
  using (((usuario_id = (select auth.uid())) OR (select can_view_all_retiros())));

alter policy "retiros_update" on public.retiros
  using (((select can_view_all_retiros()) OR ((usuario_id = (select auth.uid())) AND (created_at > (now() - '24:00:00'::interval)))))
  with check (((select can_view_all_retiros()) OR ((usuario_id = (select auth.uid())) AND (created_at > (now() - '24:00:00'::interval)))));

alter policy "bloqueo_modulo" on public.rotulo_disenos
  using ((select modulo_activo('envios'::text)))
  with check ((select modulo_activo('envios'::text)));

alter policy "rotulo_disenos_write_admin" on public.rotulo_disenos
  using ((select is_directorio_admin()))
  with check ((select is_directorio_admin()));

alter policy "bloqueo_modulo" on public.rotulos_bultos
  using ((select modulo_activo('envios'::text)))
  with check ((select modulo_activo('envios'::text)));

alter policy "bloqueo_modulo" on public.rotulos_fotos
  using ((select modulo_activo('envios'::text)))
  with check ((select modulo_activo('envios'::text)));

alter policy "bloqueo_modulo" on public.rotulos_generados
  using ((select modulo_activo('envios'::text)))
  with check ((select modulo_activo('envios'::text)));

alter policy "rotulos_generados_delete_owner" on public.rotulos_generados
  using ((select is_owner()));

alter policy "rotulos_generados_update_admin" on public.rotulos_generados
  using ((select is_directorio_admin()))
  with check ((select is_directorio_admin()));

alter policy "bloqueo_modulo" on public.sectores
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "sectores_write" on public.sectores
  using ((select is_mantenimiento_admin()))
  with check ((select is_mantenimiento_admin()));

alter policy "bloqueo_modulo" on public.subfamilias
  using ((select modulo_activo('deposito'::text)))
  with check ((select modulo_activo('deposito'::text)));

alter policy "subfamilias_delete" on public.subfamilias
  using ((select is_owner()));

alter policy "subfamilias_insert" on public.subfamilias
  with check ((select is_mantenimiento_admin()));

alter policy "subfamilias_update" on public.subfamilias
  using ((select is_owner()))
  with check ((select is_owner()));
