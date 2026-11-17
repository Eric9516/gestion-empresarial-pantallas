-- Crear y editar depósitos: además del dueño, quien tenga el permiso "Gestionar depósitos" (lo da un dueño; ver la migración de la Base del mismo número).
-- Las funciones son las mismas de antes; solo cambia quién puede usarlas.

set check_function_bodies = off;

-- 2) Crear un depósito.
create or replace function public.crear_deposito(
  p_nombre text,
  p_prefijo text,
  p_color text default null,
  p_icono text default 'deposito'
) returns public.depositos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_prefijo text := upper(btrim(coalesce(p_prefijo, '')));
  v_tope integer;
  v_activos integer;
  v_siguiente integer;
  v_fila public.depositos;
begin
  perform public.exigir_modulo('deposito');
  if auth.uid() is null or not public.usuario_activo() or not public.can_gestionar_depositos() then
    raise exception 'Solo el dueño, o quien él autorice, puede crear depósitos.';
  end if;
  if length(v_nombre) not between 1 and 120 then
    raise exception 'El nombre del depósito no puede estar vacío ni pasar de 120 letras.';
  end if;
  if v_prefijo !~ '^[A-Z]$' then
    raise exception 'La letra del depósito tiene que ser una sola letra, de la A a la Z.';
  end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color tiene que ser del tipo #1a2b3c.';
  end if;
  if coalesce(p_icono, '') !~ '^[a-z]{2,20}$' then
    raise exception 'El ícono no es válido.';
  end if;

  -- Un solo alta a la vez: así dos pedidos simultáneos no pasan el tope ni reciben el mismo número.
  perform pg_advisory_xact_lock(hashtextextended('deposito:crear', 0));

  select max_depositos into v_tope from public.licencia where id = 1;
  select count(*) into v_activos from public.depositos where activo;
  if v_activos >= coalesce(v_tope, 1) then
    raise exception 'El plan permite hasta % depósito(s) y ya están todos en uso. Para tener más, pedí ampliar el plan.', coalesce(v_tope, 1);
  end if;

  select coalesce(max(codigo::integer), 0) + 1 into v_siguiente from public.depositos where codigo ~ '^[0-9]{1,9}$';
  insert into public.depositos (codigo, nombre, prefijo, color, icono, punto_venta)
  values (lpad(v_siguiente::text, 2, '0'), v_nombre, v_prefijo, p_color, p_icono,
          least((select coalesce(max(punto_venta), 0) + 1 from public.depositos), 9999))
  returning * into v_fila;
  return v_fila;
exception
  when unique_violation then
    if sqlerrm like '%depositos_nombre_uidx%' then
      raise exception 'Ya hay un depósito con ese nombre.';
    elsif sqlerrm like '%depositos_prefijo_key%' then
      raise exception 'Esa letra ya la usa otro depósito.';
    end if;
    raise;
end;
$$;
revoke execute on function public.crear_deposito(text, text, text, text) from public, anon;
grant execute on function public.crear_deposito(text, text, text, text) to authenticated;

-- 3) Editar un depósito (el nombre, el color, el ícono, si está activo y, mientras no tenga repuestos, la letra).
create or replace function public.editar_deposito(
  p_id uuid,
  p_nombre text,
  p_color text,
  p_icono text,
  p_activo boolean,
  p_prefijo text default null
) returns public.depositos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_prefijo text := upper(btrim(coalesce(p_prefijo, '')));
  v_actual public.depositos;
  v_tope integer;
  v_activos integer;
  v_fila public.depositos;
begin
  perform public.exigir_modulo('deposito');
  if auth.uid() is null or not public.usuario_activo() or not public.can_gestionar_depositos() then
    raise exception 'Solo el dueño, o quien él autorice, puede editar depósitos.';
  end if;
  if length(v_nombre) not between 1 and 120 then
    raise exception 'El nombre del depósito no puede estar vacío ni pasar de 120 letras.';
  end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'El color tiene que ser del tipo #1a2b3c.';
  end if;
  if coalesce(p_icono, '') !~ '^[a-z]{2,20}$' then
    raise exception 'El ícono no es válido.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('deposito:crear', 0));
  select * into v_actual from public.depositos where id = p_id for update;
  if not found then
    raise exception 'No existe ese depósito.';
  end if;

  if p_activo is not true and v_actual.es_principal then
    raise exception 'El depósito principal no se puede desactivar.';
  end if;
  if p_activo is true and not v_actual.activo then
    select max_depositos into v_tope from public.licencia where id = 1;
    select count(*) into v_activos from public.depositos where activo;
    if v_activos >= coalesce(v_tope, 1) then
      raise exception 'El plan permite hasta % depósito(s) y ya están todos en uso. Para tener más, pedí ampliar el plan.', coalesce(v_tope, 1);
    end if;
  end if;

  -- La letra: solo se puede cambiar si todavía no hay repuestos (sus códigos empiezan con ella).
  if v_prefijo <> '' and v_prefijo <> v_actual.prefijo then
    if v_prefijo !~ '^[A-Z]$' then
      raise exception 'La letra del depósito tiene que ser una sola letra, de la A a la Z.';
    end if;
    if exists (select 1 from public.items where deposito_id = p_id) then
      raise exception 'La letra ya no se puede cambiar: hay repuestos cuyos códigos empiezan con ella.';
    end if;
  else
    v_prefijo := v_actual.prefijo;
  end if;

  update public.depositos
     set nombre = v_nombre, color = p_color, icono = p_icono, activo = (p_activo is true), prefijo = v_prefijo
   where id = p_id
  returning * into v_fila;
  return v_fila;
exception
  when unique_violation then
    if sqlerrm like '%depositos_nombre_uidx%' then
      raise exception 'Ya hay un depósito con ese nombre.';
    elsif sqlerrm like '%depositos_prefijo_key%' then
      raise exception 'Esa letra ya la usa otro depósito.';
    end if;
    raise;
end;
$$;
revoke execute on function public.editar_deposito(uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.editar_deposito(uuid, text, text, text, boolean, text) to authenticated;
