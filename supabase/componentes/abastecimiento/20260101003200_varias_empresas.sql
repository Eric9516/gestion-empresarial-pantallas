-- Varias empresas en una sola base (parte de Abastecimiento). Ver la migración de la Base del mismo número: acá cada tabla del
-- componente pasa a ser de una empresa, los códigos que no se pueden repetir pasan a ser "por empresa" (dos empresas pueden tener cada una
-- su repuesto AA00001, su depósito principal y su numeración de ajustes) y las funciones especiales nuevas pasan al rol que respeta las reglas.

set check_function_bodies = off;

select public._de_empresa(t::regclass) from unnest(array[
  'public.proveedores', 'public.contactos', 'public.comisionistas', 'public.rotulos_generados', 'public.rotulos_bultos',
  'public.rotulos_fotos', 'public.rotulo_disenos', 'public.items', 'public.familias', 'public.subfamilias', 'public.planilla_familias',
  'public.item_proveedores', 'public.retiros', 'public.retiro_items', 'public.ajustes_inventario', 'public.ajuste_items',
  'public.numeradores', 'public.movimientos_stock', 'public.actividad', 'public.depositos', 'public.usuarios_depositos',
  'public.sectores', 'public.reparaciones', 'public.reparacion_items', 'public.reparacion_entregas'
]) as t;

-- Lo que no se puede repetir, ahora dentro de cada empresa
alter table public.familias drop constraint if exists familias_codigo_key;
alter table public.familias add constraint familias_codigo_key unique (empresa_id, codigo);
alter table public.items drop constraint if exists items_codigo_key;
alter table public.items add constraint items_codigo_key unique (empresa_id, codigo);
alter table public.sectores drop constraint if exists sectores_nombre_key;
alter table public.sectores add constraint sectores_nombre_key unique (empresa_id, nombre);
alter table public.depositos drop constraint if exists depositos_codigo_key;
alter table public.depositos add constraint depositos_codigo_key unique (empresa_id, codigo);
alter table public.depositos drop constraint if exists depositos_prefijo_key;
alter table public.depositos add constraint depositos_prefijo_key unique (empresa_id, prefijo);
drop index if exists public.depositos_principal_uidx;
create unique index depositos_principal_uidx on public.depositos (empresa_id) where es_principal;
drop index if exists public.depositos_nombre_uidx;
create unique index depositos_nombre_uidx on public.depositos (empresa_id, lower(btrim(nombre)));
drop index if exists public.ajustes_inventario_numero_uidx;
create unique index ajustes_inventario_numero_uidx on public.ajustes_inventario (empresa_id, clase, punto_venta, numero);
alter table public.numeradores drop constraint if exists numeradores_pkey;
alter table public.numeradores add constraint numeradores_pkey primary key (empresa_id, tipo, punto_venta);
-- la planilla de familias era "una sola fila": una por empresa
alter table public.planilla_familias drop constraint if exists planilla_familias_pkey;
alter table public.planilla_familias add constraint planilla_familias_pkey primary key (empresa_id);

-- La numeración, por empresa
CREATE OR REPLACE FUNCTION public.siguiente_numero(p_tipo text, p_punto_venta integer DEFAULT 1)
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.numeradores as n (tipo, punto_venta, ultimo) values (p_tipo, p_punto_venta, 1)
  on conflict (empresa_id, tipo, punto_venta) do update set ultimo = n.ultimo + 1
  returning ultimo;
$function$;

-- Importar stock: el código se busca dentro de la empresa
CREATE OR REPLACE FUNCTION public.aplicar_importacion_stock(p_filas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lineas jsonb;
  v_total integer;
  v_partes integer;
  v_parte integer := 0;
  v_documentos jsonb := '[]'::jsonb;
  v_id uuid;
  v_desde integer;
begin
  perform public.exigir_modulo('deposito');
  if not public.is_mantenimiento_admin() or not public.can_ajustar_inventario() then
    raise exception 'No autorizado: importar stock requiere ser administrador del depósito con permiso para ajustar el inventario.';
  end if;
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    return jsonb_build_object('documentos', v_documentos);
  end if;

  -- 1) datos de los repuestos (sin tocar el stock), siempre en el mismo orden
  insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, stock_minimo, punto_pedido)
  select f.codigo, f.numero, f.descripcion, f.familia_id, f.subfamilia_id, coalesce(f.stock_minimo, 0), coalesce(f.punto_pedido, 0)
  from jsonb_to_recordset(p_filas) as f(codigo text, numero text, descripcion text, familia_id uuid, subfamilia_id uuid, stock numeric, stock_minimo numeric, punto_pedido numeric)
  order by f.codigo
  on conflict (empresa_id, codigo) do update
    set descripcion = excluded.descripcion, numero = excluded.numero, familia_id = excluded.familia_id, subfamilia_id = excluded.subfamilia_id,
        stock_minimo = excluded.stock_minimo, punto_pedido = excluded.punto_pedido;

  -- 2) las diferencias de stock, como líneas de ajuste
  select coalesce(jsonb_agg(jsonb_build_object('item_id', x.id, 'tipo', case when x.delta > 0 then 'suma' else 'resta' end, 'cantidad', abs(x.delta)) order by x.id), '[]'::jsonb)
    into v_lineas
  from (
    select i.id, f.stock - coalesce(i.stock, 0) as delta
    from jsonb_to_recordset(p_filas) as f(codigo text, stock numeric)
    join public.items i on i.codigo = f.codigo
    where f.stock is not null
  ) x
  where x.delta <> 0;

  v_total := jsonb_array_length(v_lineas);
  v_partes := (v_total + 499) / 500;
  while v_parte < v_partes loop
    v_desde := v_parte * 500;
    v_id := public.registrar_movimiento_stock(
      'ajuste', null, 'Importación de stock desde Excel', null,
      case when v_partes > 1 then 'Parte ' || (v_parte + 1) || ' de ' || v_partes else null end,
      (select jsonb_agg(value) from (select value from jsonb_array_elements(v_lineas) with ordinality t(value, n) where n > v_desde and n <= v_desde + 500 order by n) s),
      auth.uid());
    v_documentos := v_documentos || to_jsonb(v_id);
    v_parte := v_parte + 1;
  end loop;

  return jsonb_build_object('documentos', v_documentos, 'lineas', v_total);
end;
$function$;

select public._funciones_a_la_app();
