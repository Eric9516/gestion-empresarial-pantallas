-- Abastecimiento se anota como componente instalado en la licencia (E1c).
update public.licencia
   set componentes = (select array_agg(distinct c order by c) from unnest(componentes || array['abastecimiento']::text[]) as c)
 where id = 1;
