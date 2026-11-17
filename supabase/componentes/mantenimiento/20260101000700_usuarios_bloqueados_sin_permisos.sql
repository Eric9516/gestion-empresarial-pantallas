-- Parte "mantenimiento" de supabase/migrations/20260101000700_usuarios_bloqueados_sin_permisos.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Una regla más por tabla: sin usuario activo no se lee ni se escribe nada. Se suma a las que ya había
-- (las reglas "restrictivas" se combinan con "y"). Solo se exceptúan la configuración (la lee el ingreso), la licencia
-- y los perfiles, que tienen su propia regla de abajo.
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
      and c.relname = any (array['equipos', 'equipo_items'])
      and c.relname not in ('configuracion', 'licencia', 'usuarios_perfil', 'migraciones_aplicadas')
  loop
    execute format('drop policy if exists requiere_usuario_activo on public.%I', t);
    execute format(
      'create policy requiere_usuario_activo on public.%I as restrictive for all to authenticated using ((select public.usuario_activo())) with check ((select public.usuario_activo()))', t);
  end loop;
end $$;
