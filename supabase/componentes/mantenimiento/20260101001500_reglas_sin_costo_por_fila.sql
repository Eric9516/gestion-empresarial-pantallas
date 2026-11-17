-- Reglas de seguridad que se calculan una vez por consulta y no una vez por fila (generado por scripts/herramientas/envolver-reglas.mjs).
--
-- Una regla escrita como `using (modulo_activo('deposito'))` o `using (is_owner())` se evaluaba por cada fila que la consulta recorría, y además impedía que
-- Postgres usara los índices de búsqueda de texto de las búsquedas de la app: con 100.000 repuestos, una búsqueda pasaba de 38 ms a 1.471 ms, y crece con la tabla.
-- Escrita como `(select modulo_activo('deposito'))` se calcula una sola vez por consulta y los índices vuelven a servir. Es exactamente la misma regla:
-- quién puede ver o hacer qué no cambia (lo comprueban las pruebas de permisos). Lo mismo para auth.uid().
--
-- Regla de oro para las reglas nuevas: toda llamada a una función de permisos o a auth.uid() va envuelta en (select ...).

alter policy "bloqueo_modulo" on public.equipo_items
  using (((select modulo_activo('mantenimiento'::text)) AND (select modulo_activo('deposito'::text))))
  with check (((select modulo_activo('mantenimiento'::text)) AND (select modulo_activo('deposito'::text))));

alter policy "equipo_items_write" on public.equipo_items
  using ((select is_mantenimiento_admin()))
  with check ((select is_mantenimiento_admin()));

alter policy "bloqueo_modulo" on public.equipos
  using (((select modulo_activo('mantenimiento'::text)) AND (select modulo_activo('deposito'::text))))
  with check (((select modulo_activo('mantenimiento'::text)) AND (select modulo_activo('deposito'::text))));

alter policy "equipos_write" on public.equipos
  using ((select is_mantenimiento_admin()))
  with check ((select is_mantenimiento_admin()));
