-- Parte "base" de supabase/migrations/20260101000200_modulos_y_marca.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Módulos activables y colores de marca, por instalación.
--
-- modulos: qué partes de la app usa esta empresa. Es solo de presentación (muestra u
--          oculta pantallas): los permisos reales siguen estando en las políticas de la base.
-- color_primario / color_deposito: colores de la marca. NULL = los colores originales de la app.

alter table public.configuracion
  add column if not exists modulos jsonb not null
    default '{"proveedores": true, "comisionistas": true, "envios": true, "tareas": true, "deposito": true}'::jsonb,
  add column if not exists color_primario text,
  add column if not exists color_deposito text;

alter table public.configuracion
  add constraint configuracion_color_primario_check
    check (color_primario is null or color_primario ~ '^#[0-9a-fA-F]{6}$'),
  add constraint configuracion_color_deposito_check
    check (color_deposito is null or color_deposito ~ '^#[0-9a-fA-F]{6}$'),
  add constraint configuracion_modulos_check
    check (jsonb_typeof(modulos) = 'object');
