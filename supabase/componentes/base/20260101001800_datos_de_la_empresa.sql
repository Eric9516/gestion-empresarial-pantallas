-- Más datos de la empresa para los encabezados de los comprobantes (movimientos de stock, y más adelante requerimientos, órdenes de compra y de pago).
-- Se cargan en Configuración → Empresa, junto al nombre, la dirección, el teléfono y el correo que ya existían.

alter table public.configuracion
  add column if not exists empresa_razon_social text check (empresa_razon_social is null or char_length(empresa_razon_social) <= 120),
  add column if not exists empresa_cuit text check (empresa_cuit is null or char_length(empresa_cuit) <= 20),
  add column if not exists empresa_web text check (empresa_web is null or char_length(empresa_web) <= 120);
