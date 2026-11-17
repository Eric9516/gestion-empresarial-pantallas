-- Jefe de taller: un rol más de Mantenimiento (diseño del socio con el encargado, 10/11/2026). Las OT siguen un circuito: el responsable de
-- mantenimiento (el rol "admin" de siempre) las deriva, el jefe de taller las asigna a los técnicos y las revisa, y el responsable las aprueba.
-- No se quita ningún rol: siguen administrador (= responsable), técnico y solo consulta.

alter table public.usuarios_perfil drop constraint if exists usuarios_perfil_rol_equipos_check;
alter table public.usuarios_perfil add constraint usuarios_perfil_rol_equipos_check
  check (rol_equipos in ('admin', 'jefe', 'tecnico', 'consulta'));

-- Registra trabajos: un dueño, el responsable, el jefe de taller o un técnico.
create or replace function public.trabaja_en_equipos()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select activo is true and (es_owner or rol_equipos in ('admin', 'jefe', 'tecnico')) from usuarios_perfil where id = auth.uid()), false);
$$;

-- Asigna las OT a los técnicos y las revisa: el jefe de taller (y, para que nada se trabe si todavía no hay jefe, el responsable y el dueño).
create or replace function public.jefe_de_taller()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select activo is true and (es_owner or rol_equipos in ('admin', 'jefe')) from usuarios_perfil where id = auth.uid()), false);
$$;
revoke execute on function public.jefe_de_taller() from public, anon;
grant execute on function public.jefe_de_taller() to authenticated, service_role;

select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
