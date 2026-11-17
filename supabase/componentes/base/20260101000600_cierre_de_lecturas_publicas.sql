-- Parte "base" de supabase/migrations/20260101000600_cierre_de_lecturas_publicas.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Sin sesión no hace falta ningún permiso de tabla, salvo leer la configuración.
revoke all on table public."audit_log", public."configuracion", public."error_logs", public."sugerencias", public."task_history", public."tasks", public."usuarios_perfil", public."licencia" from anon;

grant select on public.configuracion to anon;

revoke all on all sequences in schema public from anon;

-- Que las tablas que se creen más adelante tampoco queden abiertas sin sesión.
alter default privileges in schema public revoke all on tables from anon;

alter default privileges in schema public revoke all on sequences from anon;

-- Estas dos funciones se podían ejecutar sin sesión (solo informan si un módulo está activo).
revoke execute on function public.exigir_modulo(variadic text[]) from public, anon;

revoke execute on function public.modulo_activo(text) from public, anon;

grant execute on function public.exigir_modulo(variadic text[]) to authenticated, service_role;

grant execute on function public.modulo_activo(text) to authenticated, service_role;

-- Dos ayudantes del historial también se podían ejecutar sin sesión.
revoke execute on function public._aud_actor() from public, anon;

revoke execute on function public._aud_cambio(text, text, text) from public, anon;

grant execute on function public._aud_actor() to authenticated, service_role;

grant execute on function public._aud_cambio(text, text, text) to authenticated, service_role;
