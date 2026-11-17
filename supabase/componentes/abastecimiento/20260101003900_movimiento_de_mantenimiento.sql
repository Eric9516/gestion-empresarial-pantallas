-- Un tipo más de movimiento de stock: "mantenimiento" (parte de Abastecimiento; ver la migración de Mantenimiento del mismo número).
-- Es lo que se descuenta al terminar una orden de trabajo de Mantenimiento: los repuestos que se usaron en un equipo. Así, en la ficha
-- de stock de cada artículo y en los movimientos, se distingue de un retiro de un operario.

alter table public.movimientos_stock drop constraint if exists movimientos_stock_tipo_check;
alter table public.movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('carga', 'ajuste', 'retiro', 'reparacion', 'mantenimiento', 'otro'));
