-- Los avisos al celular de Mantenimiento, del lado del servidor (los anota la base: supabase/componentes/mantenimiento/20260101004700_avisos_al_celular.sql).
-- Next los manda cada minuto (web/src/lib/avisosAlCelular.ts) con estas funciones, que solo puede usar el rol de Next (app_web): ven las
-- empresas de todo el servidor, porque el envío no corre con la sesión de nadie. Se puede aplicar de nuevo sin romper nada.

-- Las claves del servidor para mandar avisos (VAPID): se crean solas la primera vez y no cambian (si cambiaran, cada celular tendría que
-- volver a activar los avisos; la app lo hace sola al abrirse). No salen nunca de la base y del servidor.
create table if not exists servidor.avisos_claves (
  unica boolean primary key default true check (unica),
  publica text not null,
  privada text not null,
  sujeto text not null,
  created_at timestamptz not null default now()
);

-- Qué día ya se armó el resumen de la mañana de cada empresa.
create table if not exists servidor.avisos_resumenes (
  empresa_id uuid not null,
  dia date not null,
  primary key (empresa_id, dia)
);

create or replace function servidor.claves_de_avisos()
returns table (publica text, privada text, sujeto text) language sql stable security definer set search_path = '' as $$
  select publica, privada, sujeto from servidor.avisos_claves;
$$;

-- La primera vez: guarda las que armó Next (si dos pedidos llegan juntos, queda la primera y las dos usan esa).
create or replace function servidor.guardar_claves_de_avisos(p_publica text, p_privada text, p_sujeto text)
returns table (publica text, privada text, sujeto text) language plpgsql security definer set search_path = '' as $$
begin
  insert into servidor.avisos_claves (publica, privada, sujeto) values (p_publica, p_privada, p_sujeto) on conflict do nothing;
  return query select c.publica, c.privada, c.sujeto from servidor.avisos_claves c;
end $$;

-- Los avisos para mandar, con todo lo que hace falta para escribirlos. "vigente" = la OT sigue en la etapa del aviso (si ya avanzó, no se
-- manda). "momento" (ahora) y "terminada_en", en la hora de la empresa, para el horario de recepción.
-- (se borra antes porque cambió lo que devuelve: se agregó la empresa)
drop function if exists servidor.avisos_para_mandar(integer);
create function servidor.avisos_para_mandar(p_limite integer default 300)
returns table (id uuid, empresa_id uuid, usuario_id uuid, tipo text, ot_id uuid, cantidad integer, vigente boolean, numero bigint, equipo text, detalle text,
               urgente boolean, comentario text, quien text, terminada_en text, momento text, horario jsonb, celulares jsonb)
language sql stable security definer set search_path = '' as $$
  select a.id, a.empresa_id, a.usuario_id, a.tipo, a.ot_id, a.cantidad,
         case a.tipo
           when 'asignada' then o.etapa = 'asignada' and exists (select 1 from public.ot_asignados x where x.ot_id = o.id and x.usuario_id = a.usuario_id)
           when 'devuelta' then o.etapa = 'asignada'
           when 'para_asignar' then o.etapa = 'por_asignar'
           when 'para_revisar' then o.etapa = 'a_revisar'
           when 'para_aprobar' then o.etapa = 'para_aprobar'
           else true
         end,
         o.numero,
         nullif(concat_ws(' — ', nullif(e.codigo, ''), nullif(e.nombre, '')), ''),
         case when o.tipo = 'correctiva' and btrim(o.falla) <> '' then o.falla
              else (select t.texto from public.ot_tareas t where t.ot_id = o.id order by t.orden limit 1) end,
         coalesce(o.prioridad = 'urgente', false),
         (select p.comentario from public.ot_pasos p where p.ot_id = o.id and p.accion like 'Devolvió%' order by p.cuando desc, p.id desc limit 1),
         (select p.quien from public.ot_pasos p where p.ot_id = o.id order by p.cuando desc, p.id desc limit 1),
         to_char(o.terminada_at at time zone z.zona, 'YYYY-MM-DD"T"HH24:MI'),
         to_char(now() at time zone z.zona, 'YYYY-MM-DD"T"HH24:MI'),
         mc.horario_recepcion,
         (select coalesce(jsonb_agg(jsonb_build_object('endpoint', c.endpoint, 'p256dh', c.p256dh, 'auth', c.auth)), '[]'::jsonb)
          from public.avisos_celulares c where c.usuario_id = a.usuario_id)
  from public.avisos_cola a
  join public.usuarios_perfil u on u.id = a.usuario_id
  left join public.ordenes_trabajo o on o.id = a.ot_id
  left join public.equipos e on e.id = o.equipo_id
  left join public.mantenimiento_config mc on mc.empresa_id = a.empresa_id
  cross join lateral (select coalesce((select c.zona_horaria from public.configuracion c where c.empresa_id = a.empresa_id), 'America/Argentina/Buenos_Aires') as zona) z
  where a.enviado_at is null and a.creado_at > now() - interval '7 days' and u.activo
    and not exists (select 1 from public.avisos_apagados x where x.usuario_id = a.usuario_id and x.tipo = a.tipo)
  order by a.creado_at
  limit p_limite;
$$;

-- Los que ya se mandaron (o que ya no hay que mandar). De paso se limpia lo viejo.
create or replace function servidor.avisos_mandados(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.avisos_cola set enviado_at = now() where id = any (coalesce(p_ids, '{}'));
  delete from public.avisos_cola where enviado_at < now() - interval '30 days' or (enviado_at is null and creado_at < now() - interval '7 days');
end $$;

-- Un celular que ya no recibe (desinstaló, borró los datos o sacó el permiso): el servicio de avisos contesta que esa dirección no existe más.
create or replace function servidor.olvidar_celular(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.avisos_celulares where endpoint = p_endpoint;
$$;

-- El resumen de la mañana: al abrir el horario de recepción de cada día, cuántas preventivas hay para derivar (vencidas o por vencer, con los
-- días de aviso de su rutina, como el calendario), para el responsable. Una vez por día y por empresa. Devuelve cuántos avisos anotó.
create or replace function servidor.armar_resumenes_para_derivar()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_hoy date;
  v_hora text;
  v_franja jsonb;
  v_n integer;
  v_avisos integer := 0;
  v_anotados integer;
begin
  for r in
    select l.empresa_id, coalesce(c.zona_horaria, 'America/Argentina/Buenos_Aires') as zona, mc.horario_recepcion as horario
    from public.licencia l
    left join public.configuracion c on c.empresa_id = l.empresa_id
    left join public.mantenimiento_config mc on mc.empresa_id = l.empresa_id
    where coalesce((l.modulos ->> 'mantenimiento')::boolean, false)
  loop
    v_hoy := (now() at time zone r.zona)::date;
    v_hora := to_char(now() at time zone r.zona, 'HH24:MI');
    -- sin horario cargado, el de fábrica (lunes a viernes de 8:30 a 17 y sábados de 8:30 a 12); sin ningún día, de 8:30 a 17 todos los días
    v_franja := case
      when r.horario is null then case when extract(dow from v_hoy) between 1 and 5 then '{"desde":"08:30","hasta":"17:00"}'::jsonb
                                       when extract(dow from v_hoy) = 6 then '{"desde":"08:30","hasta":"12:00"}'::jsonb end
      when jsonb_array_length(r.horario) = 0 then '{"desde":"08:30","hasta":"17:00"}'::jsonb
      else (select f from jsonb_array_elements(r.horario) f where (f ->> 'dia')::integer = extract(dow from v_hoy)::integer limit 1)
    end;
    continue when v_franja is null or v_hora < (v_franja ->> 'desde') or v_hora > (v_franja ->> 'hasta');
    insert into servidor.avisos_resumenes (empresa_id, dia) values (r.empresa_id, v_hoy) on conflict do nothing;
    continue when not found;
    select count(*) into v_n
    from public.ordenes_trabajo o left join public.rutinas_preventivas rp on rp.id = o.rutina_id
    where o.empresa_id = r.empresa_id and o.etapa = 'por_derivar' and o.fecha_programada <= v_hoy + coalesce(rp.aviso_dias, 3);
    continue when v_n = 0;
    insert into public.avisos_cola (empresa_id, usuario_id, tipo, cantidad)
    select r.empresa_id, u.id, 'para_derivar', v_n
    from public.usuarios_perfil u
    where u.empresa_id = r.empresa_id and u.activo and (u.es_owner or u.rol_equipos = 'admin');
    get diagnostics v_anotados = row_count;
    v_avisos := v_avisos + v_anotados;
  end loop;
  delete from servidor.avisos_resumenes where dia < current_date - 30;
  return v_avisos;
end $$;

revoke all on function servidor.claves_de_avisos(), servidor.guardar_claves_de_avisos(text, text, text), servidor.avisos_para_mandar(integer),
  servidor.avisos_mandados(uuid[]), servidor.olvidar_celular(text), servidor.armar_resumenes_para_derivar() from public;
