-- Listas que crecen sin freno, paginadas en el servidor: el historial de retiros y la lista de movimientos de stock.
-- Cada una devuelve de a páginas (las más nuevas primero), con la búsqueda y los filtros hechos en la base. La página siguiente se pide desde el último elemento
-- (fecha e id), no con "saltear N": sigue siendo igual de rápida en la página 1.000. Corren con los permisos de quien las llama (las reglas de seguridad de las tablas
-- siguen valiendo: una persona común solo ve sus propios retiros).

-- 1) Ayudas: las palabras de una búsqueda (sin las conectoras, a menos que sean todas) y el patrón para buscar una palabra con ILIKE.
create or replace function public.palabras_utiles(p_texto text)
returns text[]
language sql
immutable
parallel safe
as $$
  with palabras as (
    select coalesce(array_agg(distinct x), '{}') as todas
    from regexp_split_to_table(lower(btrim(coalesce(p_texto, ''))), '\s+') x where x <> ''
  ), utiles as (
    select coalesce(array_agg(x), '{}') as sin_conectoras
    from palabras, unnest(todas) x
    where x <> all (array['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'a', 'un', 'una', 'unos', 'unas', 'para', 'con', 'sin', 'por'])
  )
  select case when cardinality(sin_conectoras) = 0 then todas else sin_conectoras end from palabras, utiles
$$;
revoke execute on function public.palabras_utiles(text) from public, anon;
grant execute on function public.palabras_utiles(text) to authenticated;

create or replace function public.patron_de_busqueda(p_palabra text)
returns text
language sql
immutable
parallel safe
as $$ select '%' || replace(replace(replace(p_palabra, '\', '\\'), '%', '\%'), '_', '\_') || '%' $$;
revoke execute on function public.patron_de_busqueda(text) from public, anon;
grant execute on function public.patron_de_busqueda(text) to authenticated;

-- 2) Los repuestos que coinciden con una palabra (código o descripción; si la palabra termina en números, también el código con otra cantidad de ceros a la izquierda).
--    Usa los índices de texto, así que con un catálogo enorme tarda milisegundos. Las listas de abajo la usan UNA vez por palabra, en vez de comparar el texto con cada línea
--    de cada retiro. Con p_max, si hay más coincidencias que ese tope devuelve p_max + 1 (la palabra es tan común que conviene comparar fila por fila y cortar al llegar a la
--    página). Solo devuelve ids, y solo a quien ya puede leer el catálogo (depósito activo y usuario activo).
create or replace function public.repuestos_con_palabra(p_palabra text, p_max integer default null)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_patron text := public.patron_de_busqueda(p_palabra);
  v_regex text;
begin
  perform public.exigir_modulo('deposito');
  if not public.usuario_activo() then
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
$$;
revoke execute on function public.repuestos_con_palabra(text, integer) from public, anon;
grant execute on function public.repuestos_con_palabra(text, integer) to authenticated;

-- 3) El historial de retiros. Filtros: texto (cada palabra debe estar en el sector, en quien lo hizo o en algún repuesto del retiro: código o descripción),
--    desde/hasta (fecha del retiro) y quién lo hizo. Cada retiro viene con sus líneas ya armadas.
create or replace function public.historial_de_retiros(
  p_texto text default null,
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_usuario uuid default null,
  p_antes_en timestamptz default null,
  p_antes_id uuid default null,
  p_limite integer default 50
) returns table (
  id uuid, usuario_id uuid, created_at timestamptz, observacion_general text, sector text, lineas jsonb
)
language plpgsql
stable
set search_path = public
as $$
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
        or (w.n <> all(v_raras) and exists (select 1 from public.retiro_items ri3 join public.items i3 on i3.id = ri3.item_id where ri3.retiro_id = r.id and public.palabra_coincide_repuesto(i3.codigo, i3.descripcion, null, w.p)))
      )))
  order by r.created_at desc, r.id desc
  limit p_limite;
end;
$$;
revoke execute on function public.historial_de_retiros(text, timestamptz, timestamptz, uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.historial_de_retiros(text, timestamptz, timestamptz, uuid, timestamptz, uuid, integer) to authenticated;

-- 4) La lista de movimientos de stock (cargas y ajustes con su comprobante). p_filtro: todos, cargas, ajustes, restas (con alguna resta), sumas, anulados.
--    El texto busca en el comprobante, motivo, referencia, observaciones, quien lo hizo o lo anuló y los repuestos.
create or replace function public.lista_de_movimientos(
  p_texto text default null,
  p_filtro text default 'todos',
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_antes_en timestamptz default null,
  p_antes_id uuid default null,
  p_limite integer default 50
) returns table (
  id uuid, created_at timestamptz, usuario_id uuid, clase text, fecha date, punto_venta integer, numero bigint, referencia text, observaciones text, motivo text,
  anulado boolean, anulado_por uuid, anulado_at timestamptz, motivo_anulacion text, lineas jsonb
)
language plpgsql
stable
set search_path = public
as $$
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
        or (w.n <> all(v_raras) and exists (select 1 from public.ajuste_items ai3 join public.items i3 on i3.id = ai3.item_id where ai3.ajuste_id = a.id and public.palabra_coincide_repuesto(i3.codigo, i3.descripcion, null, w.p)))
      )))
  order by a.created_at desc, a.id desc
  limit p_limite;
end;
$$;
revoke execute on function public.lista_de_movimientos(text, text, timestamptz, timestamptz, timestamptz, uuid, integer) from public, anon;
grant execute on function public.lista_de_movimientos(text, text, timestamptz, timestamptz, timestamptz, uuid, integer) to authenticated;

-- 5) Para que las listas paginen por fecha sin ordenar todo. Los índices de solo fecha quedan cubiertos por estos (ordenan por fecha igual) y ocuparían espacio de más.
create index if not exists ajustes_inventario_created_at_id_idx on public.ajustes_inventario (created_at desc, id desc);
create index if not exists retiros_created_at_id_idx on public.retiros (created_at desc, id desc);
drop index if exists public.retiros_created_at_idx;
drop index if exists public.ajustes_inventario_created_at_idx;
