-- Palabras clave de cada repuesto, y una búsqueda que no se traba con tildes, plurales ni el orden.
--
-- 1) El campo "detalles" se venía usando para escribir cómo llama la gente de planta a cada repuesto ("piñón de desmoldeo"), para encontrarlo
--    al buscar. Ahora ese uso tiene su propio campo, "palabras clave": lo que había en "detalles" se mueve tal cual, y "detalles" queda para
--    la información de verdad (compatibilidad, repuesto alternativo, medidas). Las palabras clave no se muestran en la lista de resultados,
--    pero pesan en la búsqueda tanto como el nombre.
-- 2) La búsqueda (y el Informe y las listas del Depósito) ya no distinguen tildes ni la ñ ("pinon" encuentra "piñón"), y el plural encuentra
--    el singular ("piñones" encuentra "piñón"). Con índices sobre el texto ya normalizado, para que siga siendo rápida.
-- 3) Orden por relevancia: primero lo que coincide en el código, después en el nombre o en las palabras clave, y al final en los detalles.
--
-- Al mover los datos se pausan los disparadores de la tabla: así no se llena el historial con una entrada por repuesto, no cambia la "versión"
-- de cada repuesto (la que avisa cuando dos personas editan a la vez) y la protección de campos (que corre sin sesión acá) no lo frena.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------
-- 1) Texto para buscar: sin tildes ni ñ y en minúsculas; y la raíz de una palabra (sin el plural)
-- ---------------------------------------------------------------------------------------------
create or replace function public.texto_de_busqueda(p_texto text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(translate(coalesce(p_texto, ''),
    'ÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑÇáàâäéèêëíìîïóòôöúùûüñç',
    'aaaaeeeeiiiioooouuuuncaaaaeeeeiiiioooouuuunc'))
$$;
revoke execute on function public.texto_de_busqueda(text) from public, anon;
grant execute on function public.texto_de_busqueda(text) to authenticated;

-- "piñones" -> "pinon", "correas" -> "correa". Como se busca dentro del texto, la raíz encuentra el singular y el plural.
create or replace function public.raiz_de_palabra(p_palabra text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when length(p_palabra) > 4 and p_palabra like '%es' then left(p_palabra, -2)
    when length(p_palabra) > 3 and p_palabra like '%s' then left(p_palabra, -1)
    else p_palabra
  end
$$;
revoke execute on function public.raiz_de_palabra(text) from public, anon;
grant execute on function public.raiz_de_palabra(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2) El campo nuevo, y lo que había en "detalles" pasa a "palabras clave"
-- ---------------------------------------------------------------------------------------------
alter table public.items add column if not exists palabras_clave text;

alter table public.items disable trigger trg_audit_items_update;
alter table public.items disable trigger trg_items_fotos_pendientes;
alter table public.items disable trigger items_set_updated_at;
update public.items
   set palabras_clave = btrim(detalles), detalles = null
 where detalles is not null and btrim(detalles) <> '' and palabras_clave is null;
update public.items set detalles = null where detalles is not null and btrim(detalles) = '';
alter table public.items enable trigger items_set_updated_at;
alter table public.items enable trigger trg_items_fotos_pendientes;
alter table public.items enable trigger trg_audit_items_update;

-- índices sobre el texto normalizado (los de antes, sobre el texto con tildes, ya no se usan)
create index if not exists items_descripcion_busqueda_idx on public.items using gin (public.texto_de_busqueda(descripcion) gin_trgm_ops);
create index if not exists items_palabras_clave_busqueda_idx on public.items using gin (public.texto_de_busqueda(palabras_clave) gin_trgm_ops);
create index if not exists items_detalles_busqueda_idx on public.items using gin (public.texto_de_busqueda(detalles) gin_trgm_ops);
drop index if exists public.items_descripcion_trgm_idx;
drop index if exists public.items_detalles_trgm_idx;

-- ---------------------------------------------------------------------------------------------
-- 3) Quién puede cambiarlas (igual que "detalles": un usuario común no) y que queden en el historial
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.items_trg_fotos_pendientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin boolean := is_mantenimiento_admin();
begin
  if pg_trigger_depth() > 1 then
    return NEW;
  end if;

  if not v_admin then
    if (NEW.codigo, NEW.familia_id, NEW.subfamilia_id, NEW.numero, NEW.descripcion,
        NEW.ubicacion, NEW.stock, NEW.detalles, NEW.palabras_clave, NEW.activo)
       is distinct from
       (OLD.codigo, OLD.familia_id, OLD.subfamilia_id, OLD.numero, OLD.descripcion,
        OLD.ubicacion, OLD.stock, OLD.detalles, OLD.palabras_clave, OLD.activo)
    then
      raise exception 'No autorizado a modificar ese campo';
    end if;
    if NEW.foto_url is distinct from OLD.foto_url then
      if NEW.foto_url is null then raise exception 'No autorizado a eliminar la foto'; end if;
      NEW.foto_pendiente := true;
      NEW.foto_subida_por := auth.uid();
      NEW.foto_subida_at := now();
    end if;
    if NEW.foto_url_2 is distinct from OLD.foto_url_2 then
      if NEW.foto_url_2 is null then raise exception 'No autorizado a eliminar la foto'; end if;
      NEW.foto_pendiente_2 := true;
      NEW.foto_subida_por_2 := auth.uid();
      NEW.foto_subida_at_2 := now();
    end if;
    if NEW.foto_url_3 is distinct from OLD.foto_url_3 then
      if NEW.foto_url_3 is null then raise exception 'No autorizado a eliminar la foto'; end if;
      NEW.foto_pendiente_3 := true;
      NEW.foto_subida_por_3 := auth.uid();
      NEW.foto_subida_at_3 := now();
    end if;
  else
    if NEW.foto_url is distinct from OLD.foto_url then
      NEW.foto_pendiente := false;
      NEW.foto_subida_por := null;
      NEW.foto_subida_at := null;
    end if;
    if NEW.foto_url_2 is distinct from OLD.foto_url_2 then
      NEW.foto_pendiente_2 := false;
      NEW.foto_subida_por_2 := null;
      NEW.foto_subida_at_2 := null;
    end if;
    if NEW.foto_url_3 is distinct from OLD.foto_url_3 then
      NEW.foto_pendiente_3 := false;
      NEW.foto_subida_por_3 := null;
      NEW.foto_subida_at_3 := null;
    end if;
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit_log_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor record;
  v_row record;
  v_desc text;
  v_cambios text;
begin
  select * into v_actor from _aud_actor();
  v_row := coalesce(new, old);
  v_desc := concat(v_row.codigo, ' — ', left(coalesce(v_row.descripcion, ''), 60));

  if tg_op = 'UPDATE' then
    v_cambios := concat_ws('; ',
      _aud_cambio('código', old.codigo, new.codigo),
      _aud_cambio('número', old.numero::text, new.numero::text),
      _aud_cambio('descripción', old.descripcion, new.descripcion),
      _aud_cambio('familia', (select nombre from familias where id = old.familia_id), (select nombre from familias where id = new.familia_id)),
      _aud_cambio('subfamilia', (select nombre from subfamilias where id = old.subfamilia_id), (select nombre from subfamilias where id = new.subfamilia_id)),
      _aud_cambio('ubicación', old.ubicacion, new.ubicacion),
      _aud_cambio('stock', old.stock::text, new.stock::text),
      case when old.detalles is distinct from new.detalles then 'detalles modificados' end,
      case when old.palabras_clave is distinct from new.palabras_clave then 'palabras clave modificadas' end,
      _aud_cambio('stock mínimo', old.stock_minimo::text, new.stock_minimo::text),
      _aud_cambio('punto de pedido', old.punto_pedido::text, new.punto_pedido::text),
      case when old.activo is distinct from new.activo
        then case when new.activo then 'restaurado desde la papelera' else 'enviado a la papelera' end end
    );
    v_desc := concat(v_desc, ' · ', v_cambios);
  end if;

  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    'items',
    v_row.id::text,
    v_desc,
    lower(tg_op),
    auth.uid(),
    v_actor.p_nombre,
    v_actor.p_email,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_audit_items_update on public.items;
CREATE TRIGGER trg_audit_items_update AFTER UPDATE OF codigo, numero, descripcion, familia_id, subfamilia_id, ubicacion, stock, detalles, palabras_clave, stock_minimo, punto_pedido, activo ON public.items FOR EACH ROW WHEN (((pg_trigger_depth() = 0) AND (((old.codigo IS DISTINCT FROM new.codigo) OR (old.numero IS DISTINCT FROM new.numero) OR (old.descripcion IS DISTINCT FROM new.descripcion) OR (old.familia_id IS DISTINCT FROM new.familia_id) OR (old.subfamilia_id IS DISTINCT FROM new.subfamilia_id) OR (old.ubicacion IS DISTINCT FROM new.ubicacion) OR (old.stock IS DISTINCT FROM new.stock) OR (old.detalles IS DISTINCT FROM new.detalles)) OR (old.palabras_clave IS DISTINCT FROM new.palabras_clave) OR (old.stock_minimo IS DISTINCT FROM new.stock_minimo) OR (old.punto_pedido IS DISTINCT FROM new.punto_pedido) OR (old.activo IS DISTINCT FROM new.activo)))) EXECUTE FUNCTION fn_audit_log_items();

-- ---------------------------------------------------------------------------------------------
-- 4) Una palabra coincide con un repuesto (la usan el Informe y las listas): sin tildes, con plural y mirando también las palabras clave
-- ---------------------------------------------------------------------------------------------
create or replace function public.palabra_coincide_repuesto(p_codigo text, p_descripcion text, p_palabras_clave text, p_detalles text, p_palabra text)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_codigo ilike public.patron_de_busqueda(lower(p_palabra))
      or public.texto_de_busqueda(p_descripcion) like x.raiz
      or public.texto_de_busqueda(p_palabras_clave) like x.raiz
      or public.texto_de_busqueda(p_detalles) like x.raiz
      or (p_palabra ~ '[0-9]+$'
          and p_codigo ~* (regexp_replace(regexp_replace(p_palabra, '[0-9]+$', ''), '([][\\.^$|?*+(){}])', '\\\1', 'g')
                           || '0*' || coalesce(nullif(ltrim((regexp_match(p_palabra, '([0-9]+)$'))[1], '0'), ''), '0') || '$'))
  from (select public.patron_de_busqueda(public.raiz_de_palabra(public.texto_de_busqueda(p_palabra))) as raiz) x
$$;
revoke execute on function public.palabra_coincide_repuesto(text, text, text, text, text) from public, anon;
grant execute on function public.palabra_coincide_repuesto(text, text, text, text, text) to authenticated;

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
    and not exists (select 1 from unnest(v_utiles) w where not public.palabra_coincide_repuesto(i.codigo, i.descripcion, i.palabras_clave, i.detalles, w))
  order by (coalesce(i.stock, 0) > 0), (i.stock_minimo - coalesce(i.stock, 0)) desc, i.codigo
  limit p_limite;
end;
$function$;

-- Las listas de retiros y de movimientos (buscar por repuesto) usan la versión nueva: también miran las palabras clave.
CREATE OR REPLACE FUNCTION public.historial_de_retiros(p_texto text DEFAULT NULL::text, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, p_usuario uuid DEFAULT NULL::uuid, p_antes_en timestamp with time zone DEFAULT NULL::timestamp with time zone, p_antes_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 50)
 RETURNS TABLE(id uuid, usuario_id uuid, created_at timestamp with time zone, observacion_general text, sector text, lineas jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_palabras text[] := public.palabras_utiles(p_texto);
  v_k integer;
  v_tmp uuid[];
  v_raras integer[] := '{}';   -- las palabras que coinciden con pocos repuestos: se resuelven una vez y se busca por ellas
  v_item_n integer[] := '{}';
  v_item_id uuid[] := '{}';
begin
  p_limite := least(greatest(coalesce(p_limite, 50), 1), 200);
  for v_k in 1..cardinality(v_palabras) loop
    select coalesce(array_agg(x), '{}') into v_tmp from public.repuestos_con_palabra(v_palabras[v_k], 3000) x;
    if cardinality(v_tmp) <= 3000 then
      v_raras := v_raras || v_k;
      v_item_id := v_item_id || v_tmp;
      v_item_n := v_item_n || array_fill(v_k, array[cardinality(v_tmp)]);
    end if;
  end loop;
  return query
  with m as materialized (
    select t.n, t.item_id from unnest(v_item_n, v_item_id) as t(n, item_id)
  ), mu as materialized (
    select w.n, u.id from unnest(v_palabras) with ordinality as w(p, n) join public.usuarios_perfil u
      on (coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '') || ' ' || coalesce(u.email, '')) ilike public.patron_de_busqueda(w.p)
  ), ms as materialized (
    select w.n, sc.id from unnest(v_palabras) with ordinality as w(p, n) join public.sectores sc on sc.nombre ilike public.patron_de_busqueda(w.p)
  )
  select r.id, r.usuario_id, r.created_at, r.observacion_general, s.nombre,
         coalesce((select jsonb_agg(jsonb_build_object('id', ri.id, 'cantidad', ri.cantidad, 'observacion', ri.observacion, 'codigo', i.codigo, 'descripcion', i.descripcion) order by ri.id)
                   from public.retiro_items ri left join public.items i on i.id = ri.item_id where ri.retiro_id = r.id), '[]'::jsonb)
  from public.retiros r
  left join public.sectores s on s.id = r.sector_id
  where (p_desde is null or r.created_at >= p_desde)
    and (p_hasta is null or r.created_at <= p_hasta)
    and (p_usuario is null or r.usuario_id = p_usuario)
    and (p_antes_en is null or (r.created_at, r.id) < (p_antes_en, p_antes_id))
    and (cardinality(v_palabras) = 0 or not exists (
      select 1 from unnest(v_palabras) with ordinality as w(p, n)
      where not (
        (w.n, r.sector_id) in (select ms.n, ms.id from ms)
        or (w.n, r.usuario_id) in (select mu.n, mu.id from mu)
        or (w.n = any(v_raras) and exists (select 1 from public.retiro_items ri2 where ri2.retiro_id = r.id and (w.n, ri2.item_id) in (select m.n, m.item_id from m)))
        or (w.n <> all(v_raras) and exists (select 1 from public.retiro_items ri3 join public.items i3 on i3.id = ri3.item_id where ri3.retiro_id = r.id and public.palabra_coincide_repuesto(i3.codigo, i3.descripcion, i3.palabras_clave, null, w.p)))
      )))
  order by r.created_at desc, r.id desc
  limit p_limite;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lista_de_movimientos(p_texto text DEFAULT NULL::text, p_filtro text DEFAULT 'todos'::text, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone, p_antes_en timestamp with time zone DEFAULT NULL::timestamp with time zone, p_antes_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 50)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, usuario_id uuid, clase text, fecha date, punto_venta integer, numero bigint, referencia text, observaciones text, motivo text, anulado boolean, anulado_por uuid, anulado_at timestamp with time zone, motivo_anulacion text, lineas jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_palabras text[] := public.palabras_utiles(p_texto);
  v_pv integer;
  v_n bigint;
  v_k integer;
  v_tmp uuid[];
  v_raras integer[] := '{}';
  v_item_n integer[] := '{}';
  v_item_id uuid[] := '{}';
begin
  p_limite := least(greatest(coalesce(p_limite, 50), 1), 200);
  -- Si se escribió un número de comprobante ("0001-00000777"), se va directo por su índice en vez de revisar todos los movimientos.
  select split_part(w, '-', 1)::integer, split_part(w, '-', 2)::bigint into v_pv, v_n from unnest(v_palabras) w where w ~ '^[0-9]{1,4}-[0-9]{1,8}$' limit 1;
  if v_n is null then
    for v_k in 1..cardinality(v_palabras) loop
      select coalesce(array_agg(x), '{}') into v_tmp from public.repuestos_con_palabra(v_palabras[v_k], 3000) x;
      if cardinality(v_tmp) <= 3000 then
        v_raras := v_raras || v_k;
        v_item_id := v_item_id || v_tmp;
        v_item_n := v_item_n || array_fill(v_k, array[cardinality(v_tmp)]);
      end if;
    end loop;
  end if;
  return query
  with m as materialized (
    select t.n, t.item_id from unnest(v_item_n, v_item_id) as t(n, item_id)
  ), mu as materialized (
    select w.n, u.id from unnest(v_palabras) with ordinality as w(p, n) join public.usuarios_perfil u
      on (coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '') || ' ' || coalesce(u.email, '')) ilike public.patron_de_busqueda(w.p)
  )
  select a.id, a.created_at, a.usuario_id, a.clase, a.fecha, a.punto_venta, a.numero, a.referencia, a.observaciones, a.motivo,
         a.anulado, a.anulado_por, a.anulado_at, a.motivo_anulacion,
         coalesce((select jsonb_agg(jsonb_build_object('id', ai.id, 'tipo', ai.tipo, 'cantidad', ai.cantidad, 'stock_antes', ai.stock_antes, 'stock_despues', ai.stock_despues,
                                                       'codigo', i.codigo, 'descripcion', i.descripcion, 'unidad', i.unidad) order by ai.id)
                   from public.ajuste_items ai left join public.items i on i.id = ai.item_id where ai.ajuste_id = a.id), '[]'::jsonb)
  from public.ajustes_inventario a
  where (v_n is null or (a.punto_venta = v_pv and a.numero = v_n and a.clase in ('carga', 'ajuste')))
    and (p_desde is null or a.created_at >= p_desde)
    and (p_hasta is null or a.created_at <= p_hasta)
    and (p_antes_en is null or (a.created_at, a.id) < (p_antes_en, p_antes_id))
    and case coalesce(p_filtro, 'todos')
          when 'cargas' then a.clase = 'carga'
          when 'ajustes' then a.clase = 'ajuste'
          when 'restas' then exists (select 1 from public.ajuste_items x where x.ajuste_id = a.id and x.tipo = 'resta')
          when 'sumas' then exists (select 1 from public.ajuste_items x where x.ajuste_id = a.id and x.tipo = 'suma')
          when 'anulados' then a.anulado
          else true end
    and (cardinality(v_palabras) = 0 or not exists (
      select 1 from unnest(v_palabras) with ordinality as w(p, n)
      where not (
        public.comprobante_texto(a.clase, a.punto_venta, a.numero) ilike public.patron_de_busqueda(w.p)
        or a.motivo ilike public.patron_de_busqueda(w.p)
        or coalesce(a.referencia ilike public.patron_de_busqueda(w.p), false)
        or coalesce(a.observaciones ilike public.patron_de_busqueda(w.p), false)
        or coalesce(a.motivo_anulacion ilike public.patron_de_busqueda(w.p), false)
        or (w.n, a.usuario_id) in (select mu.n, mu.id from mu)
        or (w.n, a.anulado_por) in (select mu.n, mu.id from mu)
        or (w.n = any(v_raras) and exists (select 1 from public.ajuste_items ai2 where ai2.ajuste_id = a.id and (w.n, ai2.item_id) in (select m.n, m.item_id from m)))
        or (w.n <> all(v_raras) and exists (select 1 from public.ajuste_items ai3 join public.items i3 on i3.id = ai3.item_id where ai3.ajuste_id = a.id and public.palabra_coincide_repuesto(i3.codigo, i3.descripcion, i3.palabras_clave, null, w.p)))
      )))
  order by a.created_at desc, a.id desc
  limit p_limite;
end;
$function$;

drop function if exists public.palabra_coincide_repuesto(text, text, text, text);

-- Los repuestos que tienen una palabra (la usan las listas de retiros y de movimientos para buscar por repuesto)
create or replace function public.repuestos_con_palabra(p_palabra text, p_max integer default null)
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_raiz text := public.patron_de_busqueda(public.raiz_de_palabra(public.texto_de_busqueda(p_palabra)));
  v_cod text := public.patron_de_busqueda(lower(p_palabra));
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
  end if;
  return query
    select i.id from public.items i
    where i.codigo ilike v_cod
       or public.texto_de_busqueda(i.descripcion) like v_raiz
       or public.texto_de_busqueda(i.palabras_clave) like v_raiz
       or (v_regex is not null and i.codigo ~* v_regex)
    limit case when p_max is null then null else p_max + 1 end;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 5) La búsqueda de repuestos
--    Cada palabra (sin tildes, y su raíz para el plural) se busca en el código, el nombre, las palabras clave y los detalles.
--    Por niveles de relevancia, y dentro de cada nivel por código (así la base corta apenas junta los que pidió, aunque la palabra sea muy común):
--      1) todas las palabras en el código, el nombre o las palabras clave;
--      2) todas las palabras, pero alguna solo en los detalles;
--      3) con varias palabras, si todavía faltan: los que tienen algunas (los que tienen más, más arriba).
-- ---------------------------------------------------------------------------------------------
create or replace function public.buscar_repuestos(p_texto text, p_limite integer default 50, p_familia_id uuid default null, p_subfamilia_id uuid default null)
returns TABLE(id uuid, codigo text, numero text, descripcion text, detalles text, ubicacion text, stock numeric, stock_minimo numeric, punto_pedido numeric, familia_id uuid, subfamilia_id uuid, foto_url text, puntaje integer)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_utiles text[];
  v_pat text[] := '{}';    -- por palabra: su raíz sin tildes, como patrón
  v_cod text[] := '{}';    -- por palabra: la palabra tal cual, para el código
  v_regex text[] := '{}';  -- por palabra (si termina en números): el código aceptando los ceros de la izquierda
  w text;
  v_prefijo text;
  v_digitos text;
  v_fuerte text;
  v_cond text;
  v_todas_fuertes text := '';
  v_todas text := '';
  v_alguna text := '';
  v_cuantas text := '';
  v_filtros text := '';
  v_columnas text := 'i.id, i.codigo, i.numero, i.descripcion, i.detalles, i.ubicacion, i.stock, i.stock_minimo, i.punto_pedido, i.familia_id, i.subfamilia_id, i.foto_url';
  v_n integer;
  v_devueltos integer := 0;
  r record;
begin
  perform public.exigir_modulo('deposito');
  -- buscar repuestos es del Depósito: hace falta tener acceso al Depósito.
  if not public.usuario_activo() or not public.tiene_acceso_mantenimiento() then
    raise exception 'No autorizado';
  end if;
  p_limite := least(greatest(coalesce(p_limite, 50), 1), 500);

  v_utiles := public.palabras_utiles(public.texto_de_busqueda(p_texto));
  v_n := cardinality(v_utiles);
  if v_n = 0 and p_familia_id is null and p_subfamilia_id is null then
    return;
  end if;

  foreach w in array v_utiles loop
    v_pat := v_pat || public.patron_de_busqueda(public.raiz_de_palabra(w));
    v_cod := v_cod || public.patron_de_busqueda(w);
    if w ~ '[0-9]+$' then
      v_prefijo := regexp_replace(w, '[0-9]+$', '');
      v_digitos := (regexp_match(w, '([0-9]+)$'))[1];
      v_regex := v_regex || (regexp_replace(v_prefijo, '([][\\.^$|?*+(){}])', '\\\1', 'g') || '0*' || coalesce(nullif(ltrim(v_digitos, '0'), ''), '0') || '$');
    else
      v_regex := array_append(v_regex, null);
    end if;
  end loop;

  if p_familia_id is not null then v_filtros := v_filtros || ' and i.familia_id = $4'; end if;
  if p_subfamilia_id is not null then v_filtros := v_filtros || ' and i.subfamilia_id = $5'; end if;

  for k in 1..v_n loop
    -- la palabra k en el código, el nombre o las palabras clave (lo más relevante) ...
    v_fuerte := format('(i.codigo ilike $2[%1$s]%2$s or public.texto_de_busqueda(i.descripcion) like $1[%1$s] or public.texto_de_busqueda(i.palabras_clave) like $1[%1$s])',
                       k, case when v_regex[k] is not null then format(' or i.codigo ~* $3[%s]', k) else '' end);
    -- ... o en cualquier lado, también los detalles
    v_cond := format('(%s or public.texto_de_busqueda(i.detalles) like $1[%s])', v_fuerte, k);
    v_todas_fuertes := v_todas_fuertes || case when k > 1 then ' and ' else '' end || v_fuerte;
    v_todas := v_todas || case when k > 1 then ' and ' else '' end || v_cond;
    v_alguna := v_alguna || case when k > 1 then ' or ' else '' end || v_cond;
    v_cuantas := v_cuantas || case when k > 1 then ' + ' else '' end || '(' || v_cond || ')::integer';
  end loop;

  -- nivel 1: todas las palabras en el código, el nombre o las palabras clave (sin texto: todo lo de la familia), por código
  for r in execute format(
    'select %s, %s::integer as puntaje from public.items i where i.activo %s and (%s) order by i.codigo limit %s',
    v_columnas, v_n, v_filtros, case when v_n = 0 then 'true' else v_todas_fuertes end, p_limite
  ) using v_pat, v_cod, v_regex, p_familia_id, p_subfamilia_id loop
    id := r.id; codigo := r.codigo; numero := r.numero; descripcion := r.descripcion; detalles := r.detalles; ubicacion := r.ubicacion; stock := r.stock;
    stock_minimo := r.stock_minimo; punto_pedido := r.punto_pedido; familia_id := r.familia_id; subfamilia_id := r.subfamilia_id; foto_url := r.foto_url; puntaje := r.puntaje;
    return next;
    v_devueltos := v_devueltos + 1;
  end loop;

  -- nivel 2: todas las palabras, pero alguna solo en los detalles
  if v_n > 0 and v_devueltos < p_limite then
    for r in execute format(
      'select %s, %s::integer as puntaje from public.items i where i.activo %s and (%s) and not (%s) order by i.codigo limit %s',
      v_columnas, v_n, v_filtros, v_todas, v_todas_fuertes, p_limite - v_devueltos
    ) using v_pat, v_cod, v_regex, p_familia_id, p_subfamilia_id loop
      id := r.id; codigo := r.codigo; numero := r.numero; descripcion := r.descripcion; detalles := r.detalles; ubicacion := r.ubicacion; stock := r.stock;
      stock_minimo := r.stock_minimo; punto_pedido := r.punto_pedido; familia_id := r.familia_id; subfamilia_id := r.subfamilia_id; foto_url := r.foto_url; puntaje := r.puntaje;
      return next;
      v_devueltos := v_devueltos + 1;
    end loop;
  end if;

  -- nivel 3 (con varias palabras, si faltan para el límite): los que tienen algunas; de los primeros por código, los que tienen más palabras arriba
  if v_n > 1 and v_devueltos < p_limite then
    for r in execute format(
      'select %s, i.puntaje from (select i.*, (%s) as puntaje from public.items i where i.activo %s and (%s) and not (%s) order by i.codigo limit %s) i order by i.puntaje desc, i.codigo',
      v_columnas, v_cuantas, v_filtros, v_alguna, v_todas, p_limite - v_devueltos
    ) using v_pat, v_cod, v_regex, p_familia_id, p_subfamilia_id loop
      id := r.id; codigo := r.codigo; numero := r.numero; descripcion := r.descripcion; detalles := r.detalles; ubicacion := r.ubicacion; stock := r.stock;
      stock_minimo := r.stock_minimo; punto_pedido := r.punto_pedido; familia_id := r.familia_id; subfamilia_id := r.subfamilia_id; foto_url := r.foto_url; puntaje := r.puntaje;
      return next;
    end loop;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 6) Crear un repuesto con sus palabras clave (la función de siempre, con un dato más al final)
-- ---------------------------------------------------------------------------------------------
drop function if exists public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text, uuid);
CREATE OR REPLACE FUNCTION public.crear_repuesto(p_familia_id uuid, p_subfamilia_id uuid, p_numero text, p_descripcion text, p_ubicacion text, p_stock numeric, p_stock_minimo numeric, p_punto_pedido numeric, p_detalles text, p_unidad text DEFAULT 'Uni'::text, p_deposito uuid DEFAULT NULL::uuid, p_palabras_clave text DEFAULT NULL::text)
 RETURNS items
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fam text;
  v_sub text;
  v_num integer;
  v_dep uuid := coalesce(p_deposito, public.deposito_por_defecto_del_usuario());
  v_prefijo text;
  v_fila public.items;
begin
  perform public.exigir_modulo('deposito');
  if not public.is_mantenimiento_admin() then raise exception 'No autorizado: solo un administrador del depósito puede crear repuestos.'; end if;
  if p_stock is not null and p_stock < 0 then raise exception 'El stock no puede ser negativo.'; end if;

  -- el depósito tiene que existir, estar activo y ser uno de los del usuario
  if v_dep is null or v_dep not in (select public.depositos_del_usuario()) then
    raise exception 'No autorizado: no tenés acceso a ese depósito.';
  end if;
  select prefijo into v_prefijo from public.depositos where id = v_dep and activo;
  if v_prefijo is null then raise exception 'Ese depósito no está activo.'; end if;

  select f.codigo, s.codigo into v_fam, v_sub
  from public.subfamilias s join public.familias f on f.id = s.familia_id
  where s.id = p_subfamilia_id and f.id = p_familia_id;
  if v_fam is null then
    raise exception 'La subfamilia no pertenece a esa familia';
  end if;

  -- la numeración es de cada depósito: la misma subfamilia puede tener repuestos en varios depósitos, cada uno con su secuencia
  if p_numero is null or btrim(p_numero) = '' then
    perform pg_advisory_xact_lock(hashtextextended('repuesto:' || v_dep::text || ':' || p_subfamilia_id::text, 0));
    select coalesce(max(numero::integer), 0) + 1 into v_num
    from public.items where subfamilia_id = p_subfamilia_id and deposito_id = v_dep and numero ~ '^[0-9]{1,5}$';
    if v_num > 99999 then
      raise exception 'Esta subfamilia ya usó todos sus números (hasta 99999)';
    end if;
  else
    if btrim(p_numero) !~ '^[0-9]{1,5}$' then
      raise exception 'El número tiene que tener hasta 5 dígitos';
    end if;
    v_num := btrim(p_numero)::integer;
  end if;

  insert into public.items (codigo, numero, descripcion, familia_id, subfamilia_id, ubicacion, stock_minimo, punto_pedido, detalles, palabras_clave, unidad, deposito_id)
  values (v_prefijo || v_fam || v_sub || lpad(v_num::text, 5, '0'), lpad(v_num::text, 5, '0'), p_descripcion, p_familia_id, p_subfamilia_id,
          nullif(p_ubicacion, ''), coalesce(p_stock_minimo, 0), coalesce(p_punto_pedido, 0), nullif(p_detalles, ''), nullif(btrim(coalesce(p_palabras_clave, '')), ''), coalesce(nullif(btrim(p_unidad), ''), 'Uni'), v_dep)
  returning * into v_fila;

  if p_stock is not null and p_stock > 0 then
    perform public.registrar_movimiento_stock(
      'carga', null, 'Carga inicial', null, 'Alta del repuesto ' || v_fila.codigo,
      jsonb_build_array(jsonb_build_object('item_id', v_fila.id, 'tipo', 'suma', 'cantidad', p_stock)), auth.uid());
    select * into v_fila from public.items where id = v_fila.id;
  end if;

  return v_fila;
end;
$function$;
revoke execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text, uuid, text) from public, anon;
grant execute on function public.crear_repuesto(uuid, uuid, text, text, text, numeric, numeric, numeric, text, text, uuid, text) to authenticated;
