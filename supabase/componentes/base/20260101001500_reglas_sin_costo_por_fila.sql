-- Reglas de seguridad que se calculan una vez por consulta y no una vez por fila (generado por scripts/herramientas/envolver-reglas.mjs).
--
-- Una regla escrita como `using (modulo_activo('deposito'))` o `using (is_owner())` se evaluaba por cada fila que la consulta recorría, y además impedía que
-- Postgres usara los índices de búsqueda de texto de las búsquedas de la app: con 100.000 repuestos, una búsqueda pasaba de 38 ms a 1.471 ms, y crece con la tabla.
-- Escrita como `(select modulo_activo('deposito'))` se calcula una sola vez por consulta y los índices vuelven a servir. Es exactamente la misma regla:
-- quién puede ver o hacer qué no cambia (lo comprueban las pruebas de permisos). Lo mismo para auth.uid().
--
-- Regla de oro para las reglas nuevas: toda llamada a una función de permisos o a auth.uid() va envuelta en (select ...).

alter policy "audit_log_select_owner" on public.audit_log
  using ((select is_owner()));

alter policy "configuracion_write_admin" on public.configuracion
  using ((select is_directorio_admin()))
  with check ((select is_directorio_admin()));

alter policy "error_logs_delete" on public.error_logs
  using ((select can_view_errores()));

alter policy "error_logs_insert" on public.error_logs
  with check ((usuario_id = (select auth.uid())));

alter policy "error_logs_select" on public.error_logs
  using ((select can_view_errores()));

alter policy "sugerencias_delete" on public.sugerencias
  using ((select can_view_sugerencias()));

alter policy "sugerencias_insert" on public.sugerencias
  with check ((usuario_id = (select auth.uid())));

alter policy "sugerencias_select" on public.sugerencias
  using ((select can_view_sugerencias()));

alter policy "bloqueo_modulo" on public.task_history
  using ((select modulo_activo('tareas'::text)))
  with check ((select modulo_activo('tareas'::text)));

alter policy "task_history_insert_own" on public.task_history
  with check (((user_id = (select auth.uid())) AND (select has_active_access(auth.uid()))));

alter policy "task_history_select_admin" on public.task_history
  using ((select is_admin(auth.uid())));

alter policy "task_history_select_own" on public.task_history
  using (((user_id = (select auth.uid())) AND (select has_active_access(auth.uid()))));

alter policy "bloqueo_modulo" on public.tasks
  using ((select modulo_activo('tareas'::text)))
  with check ((select modulo_activo('tareas'::text)));

alter policy "tasks_insert_own" on public.tasks
  with check (((user_id = (select auth.uid())) AND (select has_active_access(auth.uid()))));

alter policy "tasks_select_admin" on public.tasks
  using ((select is_admin(auth.uid())));

alter policy "tasks_select_own" on public.tasks
  using (((user_id = (select auth.uid())) AND (select has_active_access(auth.uid()))));

alter policy "tasks_update_own" on public.tasks
  using (((user_id = (select auth.uid())) AND (select has_active_access(auth.uid()))))
  with check ((user_id = (select auth.uid())));

alter policy "requiere_usuario_activo_lectura" on public.usuarios_perfil
  using (((id = ( SELECT (select auth.uid()) AS uid)) OR ( SELECT usuario_activo() AS usuario_activo)));

alter policy "usuarios_perfil_update" on public.usuarios_perfil
  using (((auth.uid() = id) OR (select is_owner())))
  with check (((auth.uid() = id) OR (select is_owner())));
