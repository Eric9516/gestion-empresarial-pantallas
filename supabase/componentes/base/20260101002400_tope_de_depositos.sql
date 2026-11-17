-- Cuántos depósitos puede tener esta empresa (decisión comercial: lo fija quien vende, no el dueño).
--
-- Valor inicial por plan: 1 / 3 / 10. Acá solo se guarda el número; quien lo cambia es la clave de servicio (el panel o el instalador), igual que el resto de la licencia.
-- El límite técnico es mucho más alto: este tope solo corta la creación de depósitos nuevos (ver crear_deposito, en Abastecimiento).

alter table public.licencia
  add column if not exists max_depositos integer not null default 1 check (max_depositos between 1 and 100);
