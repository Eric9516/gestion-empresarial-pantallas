-- Licencia por componentes y segundo interruptor del dueño (E1c).
--
-- Dos llaves distintas para que un módulo funcione:
--   1) La licencia (tabla "licencia"): la define SOLO quien vende, con la clave de servicio. Dice qué módulos incluye el plan.
--   2) El interruptor del dueño (tabla "preferencias_modulos"): el dueño puede apagar, dentro de su plan, los módulos que no usa.
--      Solo se cambia con la función "definir_modulo_del_dueno": no puede prender nada que la licencia no incluya.
-- "modulo_activo()" exige las dos, así que todas las reglas de bloqueo que ya existen respetan también el interruptor del dueño.
--
-- La licencia además guarda qué componentes están instalados ("componentes"). Cada componente se registra solo
-- (lo hace la primera migración nueva de cada uno).

set check_function_bodies = off;

-- 1) Componentes instalados. La Base siempre está.
alter table public.licencia add column if not exists componentes text[] not null default array['base']::text[];

-- 2) Lo que el dueño apagó (una sola fila). Nadie la escribe directo: solo la función de abajo.
create table public.preferencias_modulos (
  id integer primary key default 1 check (id = 1),
  apagados jsonb not null default '{}'::jsonb check (jsonb_typeof(apagados) = 'object'),
  actualizado_at timestamptz,
  actualizado_por uuid references public.usuarios_perfil (id) on delete set null
);

insert into public.preferencias_modulos (id) values (1) on conflict (id) do nothing;

alter table public.preferencias_modulos enable row level security;

create policy preferencias_modulos_select on public.preferencias_modulos for select to authenticated using (true);

-- Sin reglas de escritura: solo la función "definir_modulo_del_dueno" (y la clave de servicio) pueden cambiarla.
create policy requiere_usuario_activo on public.preferencias_modulos as restrictive for all to authenticated
  using ((select public.usuario_activo())) with check ((select public.usuario_activo()));

-- 3) Qué módulos necesita cada módulo (se mantiene a la par de src/lib/modulos.json; la prueba de esquema vigila que coincidan).
create or replace function public.modulo_requisitos()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{"envios": ["proveedores"], "mantenimiento": ["deposito"]}'::jsonb;
$$;

-- 4) Un módulo funciona si la licencia lo incluye Y el dueño no lo apagó.
create or replace function public.modulo_activo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select modulos ->> p_modulo from public.licencia where id = 1) = 'true', false)
     and coalesce((select apagados ->> p_modulo from public.preferencias_modulos where id = 1), 'false') <> 'true';
$$;

-- 5) El dueño apaga o vuelve a prender un módulo de su plan.
create or replace function public.definir_modulo_del_dueno(p_modulo text, p_apagado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requisitos jsonb := public.modulo_requisitos();
  v_licencia jsonb;
  v_apagados jsonb;
  v_otro text;
  v_req text;
  v_actor record;
begin
  if auth.uid() is null or not public.usuario_activo() or not public.is_owner() then
    raise exception 'Solo el dueño puede activar o apagar módulos.';
  end if;
  select modulos into v_licencia from public.licencia where id = 1;
  if coalesce(v_licencia ->> p_modulo, 'false') <> 'true' then
    raise exception 'El módulo "%" no está incluido en el plan de esta empresa.', p_modulo;
  end if;
  select apagados into v_apagados from public.preferencias_modulos where id = 1 for update;
  v_apagados := coalesce(v_apagados, '{}'::jsonb);

  if p_apagado then
    -- No se apaga un módulo mientras otro que lo necesita siga prendido.
    for v_otro in select key from jsonb_each(v_requisitos) where p_modulo = any (select jsonb_array_elements_text(value)) loop
      if coalesce(v_licencia ->> v_otro, 'false') = 'true' and coalesce(v_apagados ->> v_otro, 'false') <> 'true' then
        raise exception 'Primero apagá "%": necesita "%".', v_otro, p_modulo;
      end if;
    end loop;
    v_apagados := v_apagados || jsonb_build_object(p_modulo, true);
  else
    -- No se prende un módulo al que le falta lo que necesita.
    for v_req in select jsonb_array_elements_text(coalesce(v_requisitos -> p_modulo, '[]'::jsonb)) loop
      if not public.modulo_activo(v_req) then
        raise exception 'Primero activá "%": "%" lo necesita.', v_req, p_modulo;
      end if;
    end loop;
    v_apagados := v_apagados - p_modulo;
  end if;

  update public.preferencias_modulos
     set apagados = v_apagados, actualizado_at = now(), actualizado_por = auth.uid()
   where id = 1;

  select * into v_actor from public._aud_actor();
  insert into public.audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_nuevos)
  values ('preferencias_modulos', '1',
          'Módulo del dueño · ' || p_modulo || ': ' || case when p_apagado then 'apagado' else 'activo' end,
          'update', auth.uid(), v_actor.p_nombre, v_actor.p_email, jsonb_build_object('modulo', p_modulo, 'apagado', p_apagado));
end;
$$;

revoke execute on function public.modulo_requisitos() from public, anon;
revoke execute on function public.definir_modulo_del_dueno(text, boolean) from public, anon;
grant execute on function public.modulo_requisitos() to authenticated;
grant execute on function public.definir_modulo_del_dueno(text, boolean) to authenticated;

-- 6) El historial de la licencia ahora también anota los cambios de componentes instalados.
create or replace function public.fn_audit_log_licencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes jsonb := case when tg_op = 'UPDATE' then old.modulos else '{}'::jsonb end;
  v_cambios text;
begin
  if tg_op = 'UPDATE' and new.modulos is not distinct from v_antes and new.componentes is not distinct from old.componentes then
    return new;
  end if;
  select string_agg(k || ': ' || case when coalesce(new.modulos ->> k, 'false') = 'true' then 'activo' else 'apagado' end, '; ' order by k)
    into v_cambios
  from (select key as k from jsonb_each(new.modulos) union select key from jsonb_each(v_antes)) claves
  where coalesce(v_antes ->> k, 'false') is distinct from coalesce(new.modulos ->> k, 'false') or tg_op = 'INSERT';
  if tg_op = 'INSERT' or new.componentes is distinct from old.componentes then
    v_cambios := concat_ws('; ', v_cambios, 'componentes: ' || array_to_string(new.componentes, ', '));
  end if;
  insert into public.audit_log (tabla, registro_id, descripcion, accion, usuario_nombre, datos_anteriores, datos_nuevos)
  values ('licencia', '1', 'Módulos · ' || coalesce(v_cambios, 'sin cambios'), lower(tg_op), 'Administración del sistema',
          case when tg_op = 'UPDATE' then to_jsonb(old) end, to_jsonb(new));
  return new;
end;
$$;
