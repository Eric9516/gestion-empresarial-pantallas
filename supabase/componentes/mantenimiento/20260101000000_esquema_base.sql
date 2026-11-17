-- Parte "mantenimiento" de supabase/migrations/20260101000000_esquema_base.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Esquema base de la plantilla (sin datos de ninguna empresa).
-- Generado a partir de una instalación real y verificado contra ella.
-- Las mejoras propias de la plantilla van en las migraciones siguientes.
set check_function_bodies = off;
set search_path = public;

create table public."equipo_items" (
  "equipo_id" uuid not null,
  "item_id" uuid not null
);

create table public."equipos" (
  "id" uuid default gen_random_uuid() not null,
  "sector" text not null,
  "nombre" text not null,
  "datos_tecnicos" text,
  "manual_url" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table only public."equipo_items" add constraint "equipo_items_pkey" PRIMARY KEY (equipo_id, item_id);

alter table only public."equipos" add constraint "equipos_pkey" PRIMARY KEY (id);

alter table only public."equipo_items" add constraint "equipo_items_equipo_id_fkey" FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE;

alter table only public."equipo_items" add constraint "equipo_items_item_id_fkey" FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;

CREATE TRIGGER equipos_set_updated_at BEFORE UPDATE ON public.equipos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

alter table public."equipo_items" enable row level security;

alter table public."equipos" enable row level security;

create policy "equipo_items_select" on public."equipo_items"
  as permissive for select to public
  using (true);

create policy "equipo_items_write" on public."equipo_items"
  as permissive for all to authenticated
  using (is_mantenimiento_admin())
  with check (is_mantenimiento_admin());

create policy "equipos_select" on public."equipos"
  as permissive for select to public
  using (true);

create policy "equipos_write" on public."equipos"
  as permissive for all to authenticated
  using (is_mantenimiento_admin())
  with check (is_mantenimiento_admin());

create policy "documentos_select" on storage."objects"
  as permissive for select to public
  using ((bucket_id = 'documentos'::text));

create policy "documentos_write" on storage."objects"
  as permissive for all to public
  using (((bucket_id = 'documentos'::text) AND is_mantenimiento_admin()))
  with check (((bucket_id = 'documentos'::text) AND is_mantenimiento_admin()));

-- ======================================================================
-- Almacenamiento de archivos (buckets)
-- ======================================================================

insert into storage.buckets (id, name, public) values ('documentos', 'documentos', true) on conflict (id) do nothing;
