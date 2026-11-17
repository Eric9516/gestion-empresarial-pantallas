-- Parte "mantenimiento" de supabase/migrations/20260101000300_licencia_y_bloqueo_de_modulos.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Licencia de módulos y bloqueo en la base de datos.
--
-- Qué módulos usa cada instalación lo define SOLO quien vende (con la clave de servicio, por el comando
-- "pnpm cliente modulos"): vive en la tabla "licencia", que ningún usuario puede escribir. Un módulo
-- apagado queda bloqueado para todos, incluido el dueño: sus tablas, sus funciones y sus archivos.
--
-- Dependencias entre módulos:
--   envios      necesita proveedores (cada envío es de un proveedor).
--   deposito    funciona solo; sus "Reparaciones" y "Proveedores por repuesto" necesitan además proveedores.
--   comisionistas, tareas: independientes.

set check_function_bodies = off;

create policy bloqueo_modulo on public.equipos as restrictive for all to public
  using (public.modulo_activo('deposito')) with check (public.modulo_activo('deposito'));

create policy bloqueo_modulo on public.equipo_items as restrictive for all to public
  using (public.modulo_activo('deposito')) with check (public.modulo_activo('deposito'));

create policy bloqueo_modulo_documentos on storage.objects as restrictive for all to public
  using (bucket_id <> 'documentos' or public.modulo_activo('deposito'))
  with check (bucket_id <> 'documentos' or public.modulo_activo('deposito'));
