-- Reparaciones de algo que no está en el depósito (una máquina o una impresora de la planta): la línea lleva un texto libre en vez de un
-- repuesto, y no mueve el stock (ni al salir ni al volver). Una misma reparación puede mezclar las dos clases de línea.

set check_function_bodies = off;

alter table public.reparacion_items alter column item_id drop not null;
alter table public.reparacion_items add column if not exists descripcion text;
alter table public.reparacion_items drop constraint if exists reparacion_items_repuesto_o_descripcion;
alter table public.reparacion_items add constraint reparacion_items_repuesto_o_descripcion check (
  (item_id is not null and descripcion is null)
  or (item_id is null and length(btrim(descripcion)) between 1 and 300 and not descuenta_stock)
);

CREATE OR REPLACE FUNCTION public.crear_reparacion(p_proveedor_id uuid, p_motivo text, p_fecha_salida date, p_envio_id uuid, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reparacion_id uuid;
  v_item jsonb;
  v_item_id uuid;
begin
  PERFORM public.exigir_modulo('deposito', 'proveedores');
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un artículo';
  end if;

  insert into reparaciones (proveedor_id, motivo, fecha_salida, responsable_id, envio_id)
  values (p_proveedor_id, p_motivo, p_fecha_salida, auth.uid(), p_envio_id)
  returning id into v_reparacion_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_id := nullif(v_item->>'item_id', '')::uuid;
    if v_item_id is null and coalesce(btrim(v_item->>'descripcion'), '') = '' then
      raise exception 'Hay una línea sin repuesto ni descripción';
    end if;
    -- la línea de texto libre no tiene stock que descontar
    insert into reparacion_items (reparacion_id, item_id, descripcion, cantidad, descuenta_stock)
    values (v_reparacion_id, v_item_id, case when v_item_id is null then btrim(v_item->>'descripcion') end, (v_item->>'cantidad')::numeric,
            v_item_id is not null and coalesce((v_item->>'descuenta_stock')::boolean, true));
  end loop;

  return v_reparacion_id;
end;
$function$;

-- Lo que vuelve de una línea de texto libre no se suma a ningún stock
create or replace function public.reparacion_entregas_trg_validar_y_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_pendiente numeric;
  v_item_id uuid;
  v_reparacion_id uuid;
begin
  select reparacion_item_pendiente(new.reparacion_item_id) into v_pendiente;
  if new.cantidad_devuelta > v_pendiente then
    raise exception 'No podés registrar %, quedan % pendientes en esa línea.', new.cantidad_devuelta, v_pendiente;
  end if;

  select item_id, reparacion_id into v_item_id, v_reparacion_id from reparacion_items where id = new.reparacion_item_id;
  if v_item_id is null then
    new.repone_stock := false;
  end if;
  if new.resultado = 'reparado' and new.repone_stock then
    perform public.mover_stock(v_item_id, new.cantidad_devuelta, 'reparacion', 'Regreso de la reparación', 'reparaciones', v_reparacion_id);
  end if;
  return new;
end;
$$;

-- El historial nombra la línea por su repuesto o, si no tiene, por su texto
CREATE OR REPLACE FUNCTION public.fn_audit_log_reparaciones()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil record;
  v_desc text;
  v_row record;
begin
  select nombre, apellido, email into v_perfil from usuarios_perfil where id = auth.uid();
  v_row := coalesce(new, old);

  if tg_table_name = 'reparaciones' then
    v_desc := (case when tg_op = 'DELETE' then old.motivo else new.motivo end);
  elsif tg_table_name = 'reparacion_items' then
    select concat(codigo, ' x', v_row.cantidad) into v_desc from items where id = v_row.item_id;
    v_desc := coalesce(v_desc, concat(v_row.descripcion, ' x', v_row.cantidad));
  elsif tg_table_name = 'reparacion_entregas' then
    v_desc := concat('Entrega ', v_row.resultado, ' — ', v_row.cantidad_devuelta, ' unidad(es)');
  end if;

  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    tg_table_name,
    v_row.id::text,
    v_desc,
    lower(tg_op),
    auth.uid(),
    nullif(trim(coalesce(v_perfil.nombre, '') || ' ' || coalesce(v_perfil.apellido, '')), ''),
    v_perfil.email,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return v_row;
end;
$function$;

select public._funciones_a_la_app();
