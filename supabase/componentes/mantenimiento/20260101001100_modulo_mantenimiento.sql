-- Mantenimiento pasa a ser un módulo propio de la licencia (E1c).
--
-- Hasta ahora los equipos colgaban del módulo "deposito". Ahora tienen el suyo ("mantenimiento"):
--   mantenimiento necesita deposito (los repuestos de cada equipo).
-- Las reparaciones NO son de este módulo: son de lo que se manda a reparar afuera (un proveedor, repuestos del depósito y un envío), así que
-- quedan en el Depósito (componente Abastecimiento) y las bloquea la licencia de "deposito" y "proveedores".
-- Las instalaciones que ya tenían depósito prendido reciben "mantenimiento" prendido: no cambia nada de lo que hoy funciona.
-- 1) Se anota como componente instalado.
update public.licencia
   set componentes = (select array_agg(distinct c order by c) from unnest(componentes || array['mantenimiento']::text[]) as c)
 where id = 1;

-- 2) El módulo nace con el mismo valor que tenía el depósito (si la licencia todavía no lo nombra).
update public.licencia
   set modulos = modulos || jsonb_build_object('mantenimiento', coalesce(modulos ->> 'deposito', 'false') = 'true')
 where id = 1 and (modulos -> 'mantenimiento') is null;

-- 3) Reglas de bloqueo de las tablas de Mantenimiento (equipos).
drop policy if exists bloqueo_modulo on public.equipos;
create policy bloqueo_modulo on public.equipos as restrictive for all to public
  using (public.modulo_activo('mantenimiento') and public.modulo_activo('deposito')) with check (public.modulo_activo('mantenimiento') and public.modulo_activo('deposito'));

drop policy if exists bloqueo_modulo on public.equipo_items;
create policy bloqueo_modulo on public.equipo_items as restrictive for all to public
  using (public.modulo_activo('mantenimiento') and public.modulo_activo('deposito')) with check (public.modulo_activo('mantenimiento') and public.modulo_activo('deposito'));

-- Carpeta de archivos de Mantenimiento (manuales y documentos de equipos).
drop policy if exists bloqueo_modulo_documentos on storage.objects;
create policy bloqueo_modulo_documentos on storage.objects as restrictive for all to public
  using (bucket_id <> 'documentos' or (public.modulo_activo('mantenimiento') and public.modulo_activo('deposito')))
  with check (bucket_id <> 'documentos' or (public.modulo_activo('mantenimiento') and public.modulo_activo('deposito')));
