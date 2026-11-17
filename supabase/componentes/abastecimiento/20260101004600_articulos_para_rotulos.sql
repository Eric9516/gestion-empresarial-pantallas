-- Artículos del stock en la descripción de un rótulo (pedido del dueño, 12/11/2026): al armar un envío se busca un artículo (por código o
-- descripción) y se agrega "cantidad × descripción" al texto del bulto. Busca en los depósitos que la persona tiene (cada depósito es
-- hermético: la lista de artículos se lee solo del depósito actual, por eso va una función aparte). No toca el stock: solo escribe el texto.

set check_function_bodies = off;

create or replace function public.articulos_para_rotulo(p_texto text, p_limite integer default 12)
returns table (id uuid, codigo text, descripcion text, stock numeric, unidad text, deposito text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_palabras text[] := array(
    select replace(replace(replace(x, '\', '\\'), '%', '\%'), '_', '\_')
    from regexp_split_to_table(public.texto_de_busqueda(btrim(coalesce(p_texto, ''))), '\s+') x where x <> '' limit 8);
begin
  perform public.exigir_modulo('deposito');
  if cardinality(v_palabras) = 0 then return; end if;
  return query
    select i.id, i.codigo, i.descripcion, i.stock, i.unidad, d.nombre
    from public.items i
    join public.depositos d on d.id = i.deposito_id
    where i.activo
      and i.deposito_id = any ((select public.mis_depositos())::uuid[])
      and not exists (
        select 1 from unnest(v_palabras) p
        where public.texto_de_busqueda(concat_ws(' ', i.codigo, i.descripcion, i.palabras_clave)) not like '%' || p || '%')
    order by i.codigo
    limit least(greatest(coalesce(p_limite, 12), 1), 30);
end $$;

revoke execute on function public.articulos_para_rotulo(text, integer) from public, anon;
grant execute on function public.articulos_para_rotulo(text, integer) to authenticated, service_role;

select public._funciones_a_la_app();
select public._quitar_permisos_sobrantes();
