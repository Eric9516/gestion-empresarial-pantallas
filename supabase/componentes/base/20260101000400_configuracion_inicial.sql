-- Parte "base" de supabase/migrations/20260101000400_configuracion_inicial.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Asistente de configuración inicial: se abre solo, la primera vez que entra el dueño, hasta que se
-- termina o se salta. Esta marca guarda cuándo se cerró (NULL = todavía no).
alter table public.configuracion add column if not exists inicial_cerrada_at timestamptz;

-- Una instalación que ya tenía dueño cuando llega esta migración (por ejemplo, una empresa que ya
-- venía usando el sistema y pasa a la plantilla) no necesita el asistente. En una instalación nueva
-- las migraciones corren antes de crear al dueño, así que ahí la marca queda en NULL.
update public.configuracion
   set inicial_cerrada_at = now()
 where inicial_cerrada_at is null
   and exists (select 1 from public.usuarios_perfil where es_owner);
