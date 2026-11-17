-- Avisos de novedades (el puntito rojo del menú): qué fue lo último que cada persona vio.
--
-- La app muestra un número rojo en el menú cuando hay algo nuevo para esa persona (alguien retiró, llegó una sugerencia).
-- "Nuevo" quiere decir: creado después de la última vez que esa persona abrió esa sección. Esa fecha se guarda acá, en la base
-- y no en el navegador, para que al verlo en el celular también se apague en la computadora.
--
-- La hora la pone siempre la base (la función de abajo), así un reloj mal puesto en un celular no inventa ni esconde avisos.

set check_function_bodies = off;

create table public.avisos_vistos (
  usuario_id uuid not null references public.usuarios_perfil (id) on delete cascade,
  clave text not null check (clave in ('retiros', 'sugerencias')),
  visto_at timestamptz not null default now(),
  primary key (usuario_id, clave)
);

alter table public.avisos_vistos enable row level security;

-- Cada persona ve y cambia solo lo suyo.
create policy avisos_vistos_select on public.avisos_vistos for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy avisos_vistos_insert on public.avisos_vistos for insert to authenticated
  with check (usuario_id = (select auth.uid()));
create policy avisos_vistos_update on public.avisos_vistos for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

create policy requiere_usuario_activo on public.avisos_vistos as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

revoke all on public.avisos_vistos from anon;
revoke delete, truncate, references, trigger on public.avisos_vistos from authenticated;

-- "Ya vi esto": deja la última vista en este momento (hora de la base). Corre con los permisos de quien llama.
create or replace function public.marcar_aviso_visto(p_clave text)
returns timestamptz
language sql
security invoker
set search_path = public
as $$
  insert into public.avisos_vistos (usuario_id, clave, visto_at)
  values ((select auth.uid()), p_clave, now())
  on conflict (usuario_id, clave) do update set visto_at = excluded.visto_at
  returning visto_at;
$$;

revoke execute on function public.marcar_aviso_visto(text) from public, anon;
grant execute on function public.marcar_aviso_visto(text) to authenticated;
