-- Historial de actividad: la importación de stock desde Excel se nombra como tal ("importación de stock desde Excel"), no como "ajuste de inventario".
-- Internamente la importación se guarda como un ajuste (deja su comprobante AJU), pero para quien lee el historial son cosas distintas.
-- También se corrige lo que ya quedó anotado.

-- Anota en "actividad" un movimiento de stock: "Stock 1 → 0 (retiro, sector Secado)".
create or replace function public._actividad_registrar_movimiento(m public.movimientos_stock)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_nombre text;
  v_detalle text;
  v_causa text;
  v_importacion boolean;
begin
  select i.codigo, i.descripcion into v_item from public.items i where i.id = m.item_id;
  select coalesce(nullif(trim(concat(u.nombre, ' ', u.apellido)), ''), u.email) into v_nombre from public.usuarios_perfil u where u.id = m.usuario_id;
  -- la importación desde Excel se guarda como un ajuste, pero no lo es: se nombra por lo que fue
  v_importacion := m.ref_tabla = 'ajustes_inventario' and coalesce(m.motivo, '') ilike 'importación de stock%';
  v_causa := concat_ws(', ',
    case when v_importacion then 'importación de stock desde Excel' else lower(left(m.detalle, 1)) || substr(m.detalle, 2) end,
    case when m.sector is not null then 'sector ' || m.sector end,
    case when not v_importacion and m.ref_tabla = 'ajustes_inventario' and m.motivo is not null and m.motivo <> m.detalle then left(m.motivo, 60) end,
    m.comprobante);
  v_detalle := case when m.existencia is not null
    then 'Stock ' || trim_scale(m.existencia - m.entrada + m.salida)::text || ' → ' || trim_scale(m.existencia)::text
    else 'Stock ' || case when m.entrada > 0 then '+' || trim_scale(m.entrada)::text else '-' || trim_scale(m.salida)::text end end
    || case when coalesce(v_causa, '') <> '' then ' (' || v_causa || ')' else '' end;

  insert into public.actividad (momento, usuario_id, usuario_nombre, sobre, registro_id, codigo, titulo, deposito_id, accion, detalle, busqueda)
  values (m.created_at, m.usuario_id, coalesce(v_nombre, 'Sistema'), 'repuesto', m.item_id::text, v_item.codigo, coalesce(v_item.descripcion, ''), m.deposito_id,
          case when m.entrada > 0 then 'carga' else 'salida' end, v_detalle,
          public.texto_de_busqueda(concat_ws(' ', v_item.codigo, v_item.descripcion, v_detalle)));
end;
$$;

update public.actividad
   set detalle = replace(detalle, '(ajuste de inventario, Importación de stock desde Excel', '(importación de stock desde Excel'),
       busqueda = public.texto_de_busqueda(concat_ws(' ', codigo, titulo, replace(detalle, '(ajuste de inventario, Importación de stock desde Excel', '(importación de stock desde Excel')))
 where detalle like '%(ajuste de inventario, Importación de stock desde Excel%';
