-- Índices para que la base aguante crecer (repuestos, retiros, reparaciones, proveedores, rótulos y ajustes).
--
-- Una prueba de escala (scripts/pruebas/escala) llenó la base con cientos de miles de filas y midió las consultas de la app. Sin estos índices:
--   · el historial de retiros de los últimos 30 días tardaba casi 99 segundos con 100.000 retiros (para cada retiro buscaba sus líneas leyendo todas las líneas);
--   · listar proveedores con sus contactos leía todos los contactos una vez por proveedor;
--   · pedir los repuestos "de la tanda 90" o contarlos leía la tabla entera.
-- Con los datos de hoy no se nota; con muchos, la pantalla deja de responder. Postgres no crea solo el índice de una clave foránea: hay que pedirlo.
--
-- Son índices comunes (no cambian ningún dato ni ninguna regla). Los que apuntan a "quién lo hizo" son parciales (solo las filas que tienen ese dato):
-- sirven para que borrar un usuario no recorra todas las tablas, y casi no ocupan lugar.

-- Repuestos: la lista se pide ordenada por código y solo los activos; los filtros por familia y subfamilia; y la numeración dentro de una subfamilia.
create index if not exists items_activo_codigo_idx on public.items (codigo) where activo;
create index if not exists items_familia_idx on public.items (familia_id);
create index if not exists items_subfamilia_numero_idx on public.items (subfamilia_id, numero);
create index if not exists items_eliminado_por_idx on public.items (eliminado_por) where eliminado_por is not null;
create index if not exists items_foto_subida_por_idx on public.items (foto_subida_por) where foto_subida_por is not null;
create index if not exists items_foto_subida_por_2_idx on public.items (foto_subida_por_2) where foto_subida_por_2 is not null;
create index if not exists items_foto_subida_por_3_idx on public.items (foto_subida_por_3) where foto_subida_por_3 is not null;

-- Retiros: el historial (por fecha y por persona) y las líneas de cada retiro y de cada repuesto.
create index if not exists retiros_created_at_idx on public.retiros (created_at desc);
create index if not exists retiros_usuario_fecha_idx on public.retiros (usuario_id, created_at desc);
create index if not exists retiros_sector_idx on public.retiros (sector_id);
create index if not exists retiro_items_retiro_idx on public.retiro_items (retiro_id);
create index if not exists retiro_items_item_idx on public.retiro_items (item_id);

-- Ajustes de inventario.
create index if not exists ajustes_inventario_usuario_idx on public.ajustes_inventario (usuario_id);
create index if not exists ajustes_inventario_anulado_por_idx on public.ajustes_inventario (anulado_por) where anulado_por is not null;

-- Reparaciones: por proveedor y por responsable, sus líneas, sus entregas y su envío.
create index if not exists reparaciones_proveedor_idx on public.reparaciones (proveedor_id);
create index if not exists reparaciones_responsable_idx on public.reparaciones (responsable_id);
create index if not exists reparaciones_envio_idx on public.reparaciones (envio_id) where envio_id is not null;
create index if not exists reparaciones_eliminado_por_idx on public.reparaciones (eliminado_por) where eliminado_por is not null;
create index if not exists reparacion_items_reparacion_idx on public.reparacion_items (reparacion_id);
create index if not exists reparacion_items_item_idx on public.reparacion_items (item_id);
create index if not exists reparacion_entregas_linea_idx on public.reparacion_entregas (reparacion_item_id);
create index if not exists reparacion_entregas_registrado_por_idx on public.reparacion_entregas (registrado_por);

-- Proveedores y contactos: listar proveedores con sus contactos, ordenados por nombre.
create index if not exists contactos_proveedor_idx on public.contactos (proveedor_id);
create index if not exists proveedores_nombre_idx on public.proveedores (nombre) where not eliminado;
create index if not exists proveedores_eliminado_por_idx on public.proveedores (eliminado_por) where eliminado_por is not null;

-- Rótulos (envíos): por proveedor, por comisionista, las versiones de un mismo rótulo y sus bultos y fotos.
create index if not exists rotulos_generados_proveedor_idx on public.rotulos_generados (proveedor_id);
create index if not exists rotulos_generados_comisionista_idx on public.rotulos_generados (comisionista_id) where comisionista_id is not null;
create index if not exists rotulos_generados_grupo_idx on public.rotulos_generados (grupo_id, version desc);
create index if not exists rotulos_generados_creado_por_idx on public.rotulos_generados (creado_por) where creado_por is not null;
create index if not exists rotulos_generados_eliminado_por_idx on public.rotulos_generados (eliminado_por) where eliminado_por is not null;
create index if not exists rotulos_bultos_rotulo_idx on public.rotulos_bultos (rotulo_id, numero);
create index if not exists rotulos_fotos_grupo_idx on public.rotulos_fotos (grupo_id, created_at);
create index if not exists rotulos_fotos_proveedor_idx on public.rotulos_fotos (proveedor_id);
create index if not exists rotulos_fotos_creado_por_idx on public.rotulos_fotos (creado_por) where creado_por is not null;

-- Quién actualizó la planilla de familias.
create index if not exists planilla_familias_actualizada_por_idx on public.planilla_familias (actualizada_por) where actualizada_por is not null;
