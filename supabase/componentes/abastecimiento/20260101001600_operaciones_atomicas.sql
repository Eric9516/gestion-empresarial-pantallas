-- Crear un repuesto con el número asignado por la base, de forma atómica.
--
-- Antes, la pantalla calculaba el "próximo número" mirando la lista que tenía cargada y lo mandaba en el alta. Con varias personas cargando repuestos a la vez en la misma
-- subfamilia, dos recibían el mismo número y a una le fallaba el guardado ("ya existe el código"). Ahora el alta puede pedirle el número a la base:
--   · sin número: la base toma el siguiente al más alto de la subfamilia, con un candado por subfamilia, así dos altas simultáneas nunca reciben el mismo;
--   · con número (alguien eligió uno libre del medio): se usa ese, y si ya estaba ocupado falla con el aviso de siempre (código duplicado).
-- Devuelve el repuesto creado, con su código, para que la pantalla le muestre a la persona cuál le tocó.
--
-- No es "security definer": corre con los permisos de quien llama, así que valen las mismas reglas de siempre (solo un administrador del depósito puede crear repuestos).

create or replace function public.crear_repuesto(
  p_familia_id uuid,
  p_subfamilia_id uuid,
  p_numero text,
  p_descripcion text,
  p_ubicacion text,
  p_stock numeric,
  p_stock_minimo numeric,
  p_punto_pedido numeric,
  p_detalles text
) returns public.items
language plpgsql
set search_path = public
as $$
declare
  v_fam text;
  v_sub text;
  v_num integer;
  v_fila public.items;
begin
  perform public.exigir_modulo('deposito');

  select f.codigo, s.codigo into v_fam, v_sub
  from public.subfamilias s join public.familias f on f.id = s.familia_id
  where s.id = p_subfamilia_id and f.id = p_familia_id;
  if v_fam is null then
    raise exception 'La subfamilia no pertenece a esa familia';
  end if;

  if p_numero is null or btrim(p_numero) = '' then
    -- Un solo alta a la vez por subfamilia mientras se elige el número (se libera al terminar la operación).
    perform pg_advisory_xact_lock(hashtextextended('repuesto:' || p_subfamilia_id::text, 0));
    select coalesce(max(numero::integer), 0) + 1 into v_num
    from public.items where subfamilia_id = p_subfamilia_id and numero ~ '^[0-9]{1,5}$';
    if v_num > 99999 then
      raise exception 'Esta subfamilia ya usó todos sus números (hasta 99999)';
    end if;
  else
    if btrim(p_numero) !~ '^[0-9]{1,5}$' then
      raise exception 'El número tiene que tener hasta 5 dígitos';
    end if;
    v_num := btrim(p_numero)::integer;
  end if;

  insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, ubicacion, stock, stock_minimo, punto_pedido, detalles)
  values ('M' || v_fam || v_sub || lpad(v_num::text, 5, '0'), lpad(v_num::text, 5, '0'), p_descripcion, p_familia_id, p_subfamilia_id,
          nullif(p_ubicacion, ''), p_stock, coalesce(p_stock_minimo, 0), coalesce(p_punto_pedido, 0), nullif(p_detalles, ''))
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text) to authenticated;

-- Confirmar un retiro: el encabezado y todas sus líneas en una sola operación.
--
-- Antes la app hacía dos pedidos seguidos (crear el retiro y después sus líneas): si el segundo fallaba (se cortó la señal, otro cambio en el medio), quedaba un retiro vacío
-- huérfano. Ahora es todo o nada. Además, las líneas se cargan SIEMPRE en el mismo orden (por repuesto): dos retiros simultáneos que llevan los mismos repuestos en distinto orden
-- se podían trabar entre sí (cada uno esperando el repuesto que tiene el otro) y la base cancelaba uno. Con el mismo orden eso no puede pasar.
--
-- Corre con los permisos de quien llama (no es "security definer"): valen las reglas de siempre (el retiro es a nombre de quien lo hace).

create or replace function public.confirmar_retiro(p_sector_id uuid, p_observacion text, p_lineas jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.exigir_modulo('deposito');
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agregá al menos un repuesto.';
  end if;

  insert into public.retiros (usuario_id, sector_id, observacion_general)
  values (auth.uid(), p_sector_id, nullif(p_observacion, ''))
  returning id into v_id;

  insert into public.retiro_items (retiro_id, item_id, cantidad, observacion)
  select v_id, (l ->> 'item_id')::uuid, (l ->> 'cantidad')::numeric, nullif(l ->> 'observacion', '')
  from jsonb_array_elements(p_lineas) l
  order by (l ->> 'item_id')::uuid;

  return v_id;
end;
$$;

revoke execute on function public.confirmar_retiro(uuid, text, jsonb) from public, anon;
grant execute on function public.confirmar_retiro(uuid, text, jsonb) to authenticated;

-- Buscar repuestos en el servidor, usando los índices de texto.
--
-- Una búsqueda "por texto" hecha directamente sobre la tabla NO puede usar el índice de texto cuando hay reglas de seguridad por fila (PostgreSQL no deja evaluar una condición como
-- ILIKE antes que la regla de seguridad, porque podría filtrar datos), así que lee la tabla entera: con 200.000 repuestos, casi 2 segundos por búsqueda, y con muchas personas a la vez
-- deja sin procesador a todo lo demás. Esta función verifica el permiso UNA vez (módulo de depósito activo y usuario activo, que es lo mismo que exigen las reglas de la tabla)
-- y después busca con los índices.
--
-- Cómo busca: separa lo escrito en palabras (ignora "de", "para", etc., salvo que sean todas) y para cada palabra mira el código, la descripción y los detalles.
-- Un código escrito sin los ceros de la izquierda también coincide ("PU3" encuentra "MVPPU00003").
-- Orden: primero los repuestos que tienen TODAS las palabras (por código), y si faltan para llegar al límite, los que tienen alguna (también por código; cada resultado trae cuántas palabras tiene).
-- Con una sola palabra no hay que puntuar nada: se recorre el índice en orden de código y se corta apenas se juntan los que se piden (eso lo hace rápido aunque la palabra sea muy común).

create index if not exists items_detalles_trgm_idx on public.items using gin (detalles gin_trgm_ops) where detalles is not null;

create or replace function public.buscar_repuestos(
  p_texto text,
  p_limite integer default 50,
  p_familia_id uuid default null,
  p_subfamilia_id uuid default null
) returns table (
  id uuid, codigo text, numero text, descripcion text, detalles text, ubicacion text,
  stock numeric, stock_minimo numeric, punto_pedido numeric, familia_id uuid, subfamilia_id uuid, foto_url text, puntaje integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
  if not public.usuario_activo() then
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
$$;

revoke execute on function public.buscar_repuestos(text, integer, uuid, uuid) from public, anon;
grant execute on function public.buscar_repuestos(text, integer, uuid, uuid) to authenticated;
