-- Índices para que la base aguante crecer (historial, errores, sugerencias y tareas).
--
-- Una prueba de escala (scripts/pruebas/escala) llenó la base con cientos de miles de filas y midió las consultas de la app: las que no tenían índice leían la tabla
-- entera cada vez. Con pocos datos no se nota; con muchos, una pantalla pasa de milisegundos a minutos. Acá están los de la Base; los de Abastecimiento y Mantenimiento
-- van en el archivo del mismo nombre de cada componente.
--
-- Son índices comunes (no cambian ningún dato ni ninguna regla). Los que apuntan a "quién lo hizo" son parciales (solo las filas que tienen ese dato):
-- sirven para que borrar un usuario no recorra todas las tablas, y casi no ocupan lugar.

-- Historial: se muestra lo último primero, y se busca todo lo que le pasó a un registro.
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_registro_idx on public.audit_log (tabla, registro_id, created_at desc);

-- Errores y sugerencias: lo último primero; y de quién son.
create index if not exists error_logs_created_at_idx on public.error_logs (created_at desc);
create index if not exists error_logs_usuario_idx on public.error_logs (usuario_id) where usuario_id is not null;
create index if not exists sugerencias_created_at_idx on public.sugerencias (created_at desc);
create index if not exists sugerencias_usuario_idx on public.sugerencias (usuario_id) where usuario_id is not null;

-- Tareas: el historial de cada persona.
create index if not exists task_history_user_idx on public.task_history (user_id);

-- Quién cambió las preferencias de módulos.
create index if not exists preferencias_modulos_actualizado_por_idx on public.preferencias_modulos (actualizado_por) where actualizado_por is not null;
