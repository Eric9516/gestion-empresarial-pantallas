-- Parte "base" de supabase/migrations/20260101001000_rotulo_predeterminado_sin_clave.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

drop trigger if exists trg_configuracion_validar_rotulo_diseno on public.configuracion;
