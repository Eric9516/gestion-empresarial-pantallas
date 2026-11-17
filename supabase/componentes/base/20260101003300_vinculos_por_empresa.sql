-- Ningún vínculo entre tablas cruza empresas (parte de la Base; los otros componentes llaman a la misma función para los suyos).
--
-- La regla de cada tabla ya impide ver o cambiar lo de otra empresa, pero un vínculo (por ejemplo, la familia de un repuesto) se controlaba
-- solo por el id: si alguien conociera el id de una familia de otra empresa, podría apuntar a ella. Ahora cada vínculo entre dos tablas de
-- empresas lleva también la empresa ("clave compuesta": (empresa_id, familia_id) → familias (empresa_id, id)), así que la base rechaza
-- cualquier vínculo a una fila de otra empresa. Es la forma habitual en las aplicaciones de varias empresas con base compartida.
-- Lo que se borraba en cascada o quedaba vacío sigue igual (al borrar, se vacía solo la columna del vínculo, nunca la empresa).

set check_function_bodies = off;

create or replace function public._vinculos_por_empresa()
returns void language plpgsql set search_path = '' as $$
declare
  v record;
  v_columna text;
  v_accion text;
  v_unica text;
begin
  for v in
    select c.oid, c.conname, c.conrelid::regclass as tabla, c.confrelid::regclass as padre, c.conkey, c.confkey, c.confdeltype,
           (select relname from pg_class where oid = c.confrelid) as nombre_padre
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and c.confrelid <> 'public.empresas'::regclass
      and array_length(c.conkey, 1) = 1                -- (los que ya son compuestos se dejan)
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'empresa_id' and not a.attisdropped)
      and exists (select 1 from pg_attribute a where a.attrelid = c.confrelid and a.attname = 'empresa_id' and not a.attisdropped)
  loop
    v_columna := (select attname from pg_attribute where attrelid = v.tabla and attnum = v.conkey[1]);
    if (select attname from pg_attribute where attrelid = v.padre and attnum = v.confkey[1]) <> 'id' then
      raise exception 'Vínculo % apunta a una columna que no es id: revisarlo a mano', v.conname;
    end if;
    -- el padre: (empresa_id, id) único, para poder apuntarle con la empresa
    v_unica := v.nombre_padre || '_empresa_id_id_key';
    if not exists (select 1 from pg_constraint where conrelid = v.padre and conname = v_unica) then
      execute format('alter table %s add constraint %I unique (empresa_id, id)', v.padre, v_unica);
    end if;
    v_accion := case v.confdeltype
      when 'c' then 'on delete cascade'
      when 'r' then 'on delete restrict'
      when 'n' then format('on delete set null (%I)', v_columna)
      when 'd' then format('on delete set default (%I)', v_columna)
      else '' end;
    execute format('alter table %s drop constraint %I', v.tabla, v.conname);
    execute format('alter table %s add constraint %I foreign key (empresa_id, %I) references %s (empresa_id, id) %s',
                   v.tabla, v.conname, v_columna, v.padre, v_accion);
  end loop;
end $$;
revoke execute on function public._vinculos_por_empresa() from public, anon, authenticated;

select public._vinculos_por_empresa();
