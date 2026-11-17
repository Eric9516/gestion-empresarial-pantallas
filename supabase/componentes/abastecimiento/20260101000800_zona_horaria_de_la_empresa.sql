-- Parte "abastecimiento" de supabase/migrations/20260101000800_zona_horaria_de_la_empresa.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Corregir un retiro "el mismo día": el día se mide en la zona de la empresa.
alter policy retiros_update on public.retiros
  with check ((can_view_all_retiros() OR ((usuario_id = auth.uid()) AND (public.fecha_local(created_at) = public.hoy_local()))));

alter policy retiro_items_update on public.retiro_items
  with check ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND (can_view_all_retiros() OR ((r.usuario_id = auth.uid()) AND (public.fecha_local(r.created_at) = public.hoy_local())))))));
