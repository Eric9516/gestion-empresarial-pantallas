-- Índices para que la base aguante crecer (equipos y sus repuestos).
-- Ver el mismo archivo de Abastecimiento: acá solo el que corresponde a Mantenimiento.
create index if not exists equipo_items_item_idx on public.equipo_items (item_id);
