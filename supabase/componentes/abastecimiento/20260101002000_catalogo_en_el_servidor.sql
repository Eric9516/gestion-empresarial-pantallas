-- El catálogo vive en el servidor: la aplicación ya no lo descarga entero para filtrarlo en el navegador.
-- Esta migración agrega lo que falta para el informe de reposición (lo que hay que comprar), con filtros, orden de urgencia y total, sin traer nada de más.

-- 1) Una palabra contra un repuesto: está en el código, la descripción o los detalles (sin importar mayúsculas), y si la palabra termina en números, también
--    se acepta el código con otra cantidad de ceros a la izquierda ("PU003" encuentra "MVPPU00003"). Es la misma regla que usa buscar_repuestos.
create or replace function public.palabra_coincide_repuesto(p_codigo text, p_descripcion text, p_detalles text, p_palabra text)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_codigo ilike x.patron
      or p_descripcion ilike x.patron
      or coalesce(p_detalles ilike x.patron, false)
      or (p_palabra ~ '[0-9]+$'
          and p_codigo ~* (regexp_replace(regexp_replace(p_palabra, '[0-9]+$', ''), '([][\\.^$|?*+(){}])', '\\\1', 'g')
                           || '0*' || coalesce(nullif(ltrim((regexp_match(p_palabra, '([0-9]+)$'))[1], '0'), ''), '0') || '$'))
  from (select '%' || replace(replace(replace(p_palabra, '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron) x
$$;
revoke execute on function public.palabra_coincide_repuesto(text, text, text, text) from public, anon;
grant execute on function public.palabra_coincide_repuesto(text, text, text, text) to authenticated;

-- 2) Los repuestos que hay que reponer: tienen stock mínimo cargado y su stock llegó al punto de pedido (o bajó de él). Los sin stock primero y, después, los de
--    mayor cantidad a comprar. Devuelve hasta p_limite (como mucho 5.000) y, en cada fila, el total que cumple (para avisar si hay más) y cuántos están sin stock.
--    p_estado: 'presupuesto', 'compras' o 'sin' (los que todavía no se marcaron). Un índice parcial deja ese conjunto a mano aunque el catálogo sea enorme.
create index if not exists items_a_reponer_idx on public.items (codigo)
  where activo and stock_minimo > 0 and coalesce(stock, 0) <= punto_pedido;

create or replace function public.repuestos_a_reponer(
  p_texto text default null,
  p_familia_id uuid default null,
  p_estado text default null,
  p_limite integer default 500
) returns table (
  id uuid, codigo text, numero text, descripcion text, detalles text, stock numeric, stock_minimo numeric, punto_pedido numeric,
  familia_id uuid, subfamilia_id uuid, estado_reposicion text, total bigint, total_sin_stock bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_palabras text[];
  v_utiles text[];
  v_conectoras constant text[] := array['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'a', 'un', 'una', 'unos', 'unas', 'para', 'con', 'sin', 'por'];
begin
  perform public.exigir_modulo('deposito');
  if not public.usuario_activo() then
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
$$;
revoke execute on function public.repuestos_a_reponer(text, uuid, text, integer) from public, anon;
grant execute on function public.repuestos_a_reponer(text, uuid, text, integer) to authenticated;
