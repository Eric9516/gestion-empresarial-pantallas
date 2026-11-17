-- Parte "mantenimiento" de supabase/migrations/20260101000600_cierre_de_lecturas_publicas.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Sin sesión no hace falta ningún permiso de tabla, salvo leer la configuración.
revoke all on table public."equipo_items", public."equipos" from anon;

revoke all on all sequences in schema public from anon;
