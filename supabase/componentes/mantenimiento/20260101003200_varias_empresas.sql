-- Varias empresas en una sola base (parte de Mantenimiento). Ver la migración de la Base del mismo número.

select public._de_empresa(t::regclass) from unnest(array['public.equipos', 'public.equipo_items']) as t;
select public._funciones_a_la_app();
