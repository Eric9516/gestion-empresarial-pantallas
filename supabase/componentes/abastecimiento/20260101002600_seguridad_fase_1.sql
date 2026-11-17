-- Seguridad, fase 1 (parte de Abastecimiento). Sale de la auditoría del 2026-10-17 (ver docs/AUDITORIA-BASE-DE-DATOS.md).
--
-- 1) Los repuestos (con su stock y su ubicación) los lee solo quien tiene acceso al Depósito: antes cualquier persona con sesión podía pedirlos
--    por la API, aunque fuera solo del Directorio. Lo mismo para las funciones del catálogo, y el Informe de reposición queda para los
--    administradores del Depósito (como ya mostraba la pantalla). Y crear retiros (y sus líneas) también exige acceso al Depósito: antes la regla
--    pedía solo que el retiro fuera propio, así que alguien solo del Directorio podía crear uno por la API y descontar stock.
-- 2) Las reglas de "módulo activo" de las tablas y carpetas más nuevas se calculaban una vez por fila; ahora una sola vez por consulta (como las demás).
-- 3) Índice para listar los movimientos de un depósito (y para la clave foránea, que no tenía).
-- 4) Sin permisos TRUNCATE / REFERENCES / TRIGGER sobre las tablas de este componente (ver la migración de la Base del mismo número).

set check_function_bodies = off;

-- 1) Leer repuestos: solo con acceso al Depósito
alter policy items_select on public.items using ((select public.tiene_acceso_mantenimiento()));

-- buscar_repuestos: buscar repuestos es del Depósito: hace falta tener acceso al Depósito.
CREATE OR REPLACE FUNCTION public.buscar_repuestos(p_texto text, p_limite integer DEFAULT 50, p_familia_id uuid DEFAULT NULL::uuid, p_subfamilia_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, codigo text, numero text, descripcion text, detalles text, ubicacion text, stock numeric, stock_minimo numeric, punto_pedido numeric, familia_id uuid, subfamilia_id uuid, foto_url text, puntaje integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_palabras text[];
  v_utiles text[];
  v_likes text[] := '{}';
  v_regex text[] := '{}';
  w text;
  v_prefijo text;
  v_digitos text;
  v_todas text := '';
  v_alguna text := '';
  v_filtros text := '';
  v_columnas text := 'i.id, i.codigo, i.numero, i.descripcion, i.detalles, i.ubicacion, i.stock, i.stock_minimo, i.punto_pedido, i.familia_id, i.subfamilia_id, i.foto_url';
  v_cond text;
  v_n integer;
  v_devueltos integer := 0;
  r record;
  v_conectoras constant text[] := array['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'a', 'un', 'una', 'unos', 'unas', 'para', 'con', 'sin', 'por'];
begin
  perform public.exigir_modulo('deposito');
  -- buscar repuestos es del Depósito: hace falta tener acceso al Depósito.
  if not public.usuario_activo() or not public.tiene_acceso_mantenimiento() then
    raise exception 'No autorizado';
  end if;
  p_limite := least(greatest(coalesce(p_limite, 50), 1), 500);

  select coalesce(array_agg(distinct x), '{}') into v_palabras
  from regexp_split_to_table(lower(btrim(coalesce(p_texto, ''))), '\s+') x where x <> '';
  select coalesce(array_agg(x), '{}') into v_utiles from unnest(v_palabras) x where x <> all (v_conectoras);
  if cardinality(v_utiles) = 0 then v_utiles := v_palabras; end if;
  v_n := cardinality(v_utiles);
  if v_n = 0 and p_familia_id is null and p_subfamilia_id is null then
    return;
  end if;

  -- un patrón por palabra, y (si termina en números) una expresión que acepta los ceros de la izquierda
  foreach w in array v_utiles loop
    v_likes := v_likes || ('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%');
    if w ~ '[0-9]+$' then
      v_prefijo := regexp_replace(w, '[0-9]+$', '');
      v_digitos := (regexp_match(w, '([0-9]+)$'))[1];
      v_regex := v_regex || (regexp_replace(v_prefijo, '([][\\.^$|?*+(){}])', '\\\1', 'g') || '0*' || coalesce(nullif(ltrim(v_digitos, '0'), ''), '0') || '$');
    else
      v_regex := array_append(v_regex, null);
    end if;
  end loop;

  if p_familia_id is not null then v_filtros := v_filtros || ' and i.familia_id = $3'; end if;
  if p_subfamilia_id is not null then v_filtros := v_filtros || ' and i.subfamilia_id = $4'; end if;

  for k in 1..v_n loop
    v_cond := format('(i.codigo ilike $1[%1$s] or i.descripcion ilike $1[%1$s] or (i.detalles is not null and i.detalles ilike $1[%1$s])%2$s)', k,
                     case when v_regex[k] is not null then format(' or i.codigo ~* $2[%s]', k) else '' end);
    v_todas := v_todas || case when k > 1 then ' and ' else '' end || v_cond;
    v_alguna := v_alguna || case when k > 1 then ' or ' else '' end || v_cond;
  end loop;

  -- fase 1: los que tienen todas las palabras (con una sola palabra, es la única fase), en orden de código
  for r in execute format(
    'select %s, %s::integer as puntaje from public.items i where i.activo %s and (%s) order by i.codigo limit %s',
    v_columnas, v_n, v_filtros, case when v_n = 0 then 'true' else v_todas end, p_limite
  ) using v_likes, v_regex, p_familia_id, p_subfamilia_id loop
    id := r.id; codigo := r.codigo; numero := r.numero; descripcion := r.descripcion; detalles := r.detalles; ubicacion := r.ubicacion; stock := r.stock;
    stock_minimo := r.stock_minimo; punto_pedido := r.punto_pedido; familia_id := r.familia_id; subfamilia_id := r.subfamilia_id; foto_url := r.foto_url; puntaje := r.puntaje;
    return next;
    v_devueltos := v_devueltos + 1;
  end loop;

  -- fase 2 (solo con varias palabras y si faltan para llegar al límite): los que tienen alguna, los que tienen más palabras primero
  if v_n > 1 and v_devueltos < p_limite then
    for r in execute format(
      'select %s, (select count(*)::integer from unnest($1) p where i.codigo ilike p or i.descripcion ilike p or coalesce(i.detalles ilike p, false)) as puntaje
       from (select * from public.items i where i.activo %s and (%s) and not (%s) order by i.codigo limit %s) i',
      v_columnas, v_filtros, v_alguna, v_todas, p_limite - v_devueltos
    ) using v_likes, v_regex, p_familia_id, p_subfamilia_id loop
      id := r.id; codigo := r.codigo; numero := r.numero; descripcion := r.descripcion; detalles := r.detalles; ubicacion := r.ubicacion; stock := r.stock;
      stock_minimo := r.stock_minimo; punto_pedido := r.punto_pedido; familia_id := r.familia_id; subfamilia_id := r.subfamilia_id; foto_url := r.foto_url; puntaje := r.puntaje;
      return next;
    end loop;
  end if;
end;
$function$;

-- repuestos_con_palabra: la usan las listas del Depósito (retiros, movimientos): hace falta tener acceso al Depósito.
CREATE OR REPLACE FUNCTION public.repuestos_con_palabra(p_palabra text, p_max integer DEFAULT NULL::integer)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_patron text := public.patron_de_busqueda(p_palabra);
  v_regex text;
begin
  perform public.exigir_modulo('deposito');
  -- la usan las listas del Depósito (retiros, movimientos): hace falta tener acceso al Depósito.
  if not public.usuario_activo() or not public.tiene_acceso_mantenimiento() then
    raise exception 'No autorizado';
  end if;
  if p_palabra ~ '[0-9]+$' then
    v_regex := regexp_replace(regexp_replace(p_palabra, '[0-9]+$', ''), '([][\\.^$|?*+(){}])', '\\\1', 'g')
               || '0*' || coalesce(nullif(ltrim((regexp_match(p_palabra, '([0-9]+)$'))[1], '0'), ''), '0') || '$';
    return query select i.id from public.items i where i.codigo ilike v_patron or i.descripcion ilike v_patron or i.codigo ~* v_regex limit case when p_max is null then null else p_max + 1 end;
  else
    return query select i.id from public.items i where i.codigo ilike v_patron or i.descripcion ilike v_patron limit case when p_max is null then null else p_max + 1 end;
  end if;
end;
$function$;

-- repuestos_a_reponer: es el Informe de reposición: solo los administradores del Depósito (y los dueños).
CREATE OR REPLACE FUNCTION public.repuestos_a_reponer(p_texto text DEFAULT NULL::text, p_familia_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_limite integer DEFAULT 500)
 RETURNS TABLE(id uuid, codigo text, numero text, descripcion text, detalles text, stock numeric, stock_minimo numeric, punto_pedido numeric, familia_id uuid, subfamilia_id uuid, estado_reposicion text, total bigint, total_sin_stock bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_palabras text[];
  v_utiles text[];
  v_conectoras constant text[] := array['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'a', 'un', 'una', 'unos', 'unas', 'para', 'con', 'sin', 'por'];
begin
  perform public.exigir_modulo('deposito');
  -- es el Informe de reposición: solo los administradores del Depósito (y los dueños).
  if not public.usuario_activo() or not public.is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;
  p_limite := least(greatest(coalesce(p_limite, 500), 1), 5000);

  select coalesce(array_agg(distinct x), '{}') into v_palabras
  from regexp_split_to_table(lower(btrim(coalesce(p_texto, ''))), '\s+') x where x <> '';
  select coalesce(array_agg(x), '{}') into v_utiles from unnest(v_palabras) x where x <> all (v_conectoras);
  if cardinality(v_utiles) = 0 then v_utiles := v_palabras; end if;

  return query
  select i.id, i.codigo, i.numero, i.descripcion, i.detalles, i.stock, i.stock_minimo, i.punto_pedido, i.familia_id, i.subfamilia_id, i.estado_reposicion,
         count(*) over () as total,
         count(*) filter (where coalesce(i.stock, 0) = 0) over () as total_sin_stock
  from public.items i
  where i.activo and i.stock_minimo > 0 and coalesce(i.stock, 0) <= i.punto_pedido
    and (p_familia_id is null or i.familia_id = p_familia_id)
    and (coalesce(p_estado, '') = '' or (p_estado = 'sin' and i.estado_reposicion is null) or i.estado_reposicion = p_estado)
    and not exists (select 1 from unnest(v_utiles) w where not public.palabra_coincide_repuesto(i.codigo, i.descripcion, i.detalles, w))
  order by (coalesce(i.stock, 0) > 0), (i.stock_minimo - coalesce(i.stock, 0)) desc, i.codigo
  limit p_limite;
end;
$function$;

-- 1b) Crear retiros y sus líneas: solo con acceso al Depósito (además de que el retiro sea propio)
alter policy retiros_insert on public.retiros
  with check (usuario_id = (select auth.uid()) and (select public.tiene_acceso_mantenimiento()));
alter policy retiro_items_insert on public.retiro_items
  with check ((select public.tiene_acceso_mantenimiento()) and exists (select 1 from public.retiros r where r.id = retiro_items.retiro_id and r.usuario_id = (select auth.uid())));

-- 2) Reglas que se evaluaban por fila: una sola vez por consulta
alter policy bloqueo_modulo on public.movimientos_stock
  using ((select public.modulo_activo('deposito'))) with check ((select public.modulo_activo('deposito')));
alter policy bloqueo_modulo on public.depositos
  using ((select public.modulo_activo('deposito'))) with check ((select public.modulo_activo('deposito')));
alter policy bloqueo_modulo on public.usuarios_depositos
  using ((select public.modulo_activo('deposito'))) with check ((select public.modulo_activo('deposito')));
alter policy items_photos_write on storage.objects
  using (bucket_id = 'items' and (select public.tiene_acceso_mantenimiento()))
  with check (bucket_id = 'items' and (select public.tiene_acceso_mantenimiento()));
alter policy bloqueo_modulo_items on storage.objects
  using (bucket_id <> 'items' or (select public.modulo_activo('deposito')))
  with check (bucket_id <> 'items' or (select public.modulo_activo('deposito')));
alter policy bloqueo_modulo_rotulos on storage.objects
  using (bucket_id <> 'rotulos' or (select public.modulo_activo('envios')))
  with check (bucket_id <> 'rotulos' or (select public.modulo_activo('envios')));

-- 3) Movimientos de un depósito, del más nuevo al más viejo
create index if not exists movimientos_stock_deposito_fecha_idx on public.movimientos_stock (deposito_id, created_at desc, id);

-- 4) Permisos sobrantes en las tablas de este componente
select public._quitar_permisos_sobrantes();
