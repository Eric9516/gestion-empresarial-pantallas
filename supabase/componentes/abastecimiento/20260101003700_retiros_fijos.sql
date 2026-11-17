-- Los retiros quedan fijos: nadie los corrige ni los borra.
--
-- Antes, quien hizo un retiro podía corregirlo o borrarlo durante 24 horas (y quien ve todos los retiros, siempre). "Devolver" cambiaba el retiro
-- original: le bajaba la cantidad o borraba la línea, o sea que se cambiaba el pasado y el plazo de 24 horas confundía. Ahora un retiro es un registro
-- de lo que salió y no se toca. Si algo vuelve al depósito, entra como una carga de stock ("Devolución de un sector"), con su comprobante, quién la
-- hizo y la aclaración (el historial de retiros la arma ya completa con el botón "Registrar devolución").
--
--   · retiros: nadie los borra; solo se cambia la marca de "exportado" (la pone quien ve todos los retiros al exportarlos a Excel).
--   · líneas de un retiro: nadie las cambia ni las borra, y solo se agregan al hacer el retiro (antes se podían sumar líneas a un retiro viejo).
--   · historial_de_retiros: cada línea trae también el artículo (item_id), para armar la devolución.
--
-- Las funciones de la base que corren con permisos propios (y el borrado de una empresa entera) no pasan por estas reglas: no cambian.

set check_function_bodies = off;

drop policy if exists "retiros_delete" on public.retiros;
drop policy if exists "retiro_items_update" on public.retiro_items;
drop policy if exists "retiro_items_delete" on public.retiro_items;

drop policy if exists "retiros_update" on public.retiros;
create policy "retiros_update" on public.retiros
  as permissive for update to authenticated
  using ((select can_view_all_retiros()))
  with check ((select can_view_all_retiros()));

drop policy if exists "retiro_items_insert" on public.retiro_items;
create policy "retiro_items_insert" on public.retiro_items
  as permissive for insert to authenticated
  with check (exists (select 1 from public.retiros r
    where r.id = retiro_items.retiro_id and r.usuario_id = (select auth.uid()) and r.created_at > now() - interval '5 minutes'));

-- Del retiro solo cambia la marca de exportado (lo demás es el registro de lo que salió). Vale para las personas que usan la app; el mantenimiento
-- de la base (sin sesión de nadie) no pasa por acá.
create or replace function public.retiros_solo_cambia_exportado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and ((new.id, new.usuario_id, new.sector_id, new.observacion_general, new.created_at)
     is distinct from (old.id, old.usuario_id, old.sector_id, old.observacion_general, old.created_at)) then
    raise exception 'Un retiro no se cambia: si algo vuelve al depósito, se registra como una devolución.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_retiros_solo_cambia_exportado on public.retiros;
create trigger trg_retiros_solo_cambia_exportado before update on public.retiros
  for each row execute function public.retiros_solo_cambia_exportado();

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
         coalesce((select jsonb_agg(jsonb_build_object('id', ri.id, 'item_id', ri.item_id, 'cantidad', ri.cantidad, 'observacion', ri.observacion, 'codigo', i.codigo, 'descripcion', i.descripcion) order by ri.id)
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

select public._funciones_a_la_app();
