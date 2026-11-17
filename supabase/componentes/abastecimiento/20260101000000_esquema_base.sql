-- Parte "abastecimiento" de supabase/migrations/20260101000000_esquema_base.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Esquema base de la plantilla (sin datos de ninguna empresa).
-- Generado a partir de una instalación real y verificado contra ella.
-- Las mejoras propias de la plantilla van en las migraciones siguientes.
set check_function_bodies = off;
set search_path = public;

create table public."comisionistas" (
  "id" uuid default gen_random_uuid() not null,
  "nombre" text not null,
  "zona" text,
  "empresa" text,
  "telefono" text,
  "celular" text,
  "email" text,
  "localidad" text,
  "provincia" text,
  "notas" text,
  "activo" boolean default true,
  "campos_extra" jsonb default '{}'::jsonb,
  "modificado_por" text,
  "updated_at" timestamp with time zone default now()
);

create table public."contactos" (
  "id" uuid default gen_random_uuid() not null,
  "proveedor_id" uuid,
  "nombre" text not null,
  "cargo" text,
  "telefono" text,
  "celular" text,
  "email" text,
  "created_at" timestamp with time zone default now()
);

create table public."familias" (
  "id" uuid default gen_random_uuid() not null,
  "codigo" text not null,
  "nombre" text not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."item_proveedores" (
  "id" uuid default gen_random_uuid() not null,
  "item_id" uuid not null,
  "proveedor_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."items" (
  "id" uuid default gen_random_uuid() not null,
  "codigo" text not null,
  "numero" text not null,
  "descripcion" text not null,
  "familia_id" uuid not null,
  "subfamilia_id" uuid not null,
  "ubicacion" text,
  "stock" numeric,
  "foto_url" text,
  "activo" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "eliminado_por" uuid,
  "eliminado_at" timestamp with time zone,
  "detalles" text,
  "foto_url_2" text,
  "foto_pendiente" boolean default false not null,
  "foto_pendiente_2" boolean default false not null,
  "foto_subida_por" uuid,
  "foto_subida_por_2" uuid,
  "foto_subida_at" timestamp with time zone,
  "foto_subida_at_2" timestamp with time zone,
  "foto_url_3" text,
  "foto_pendiente_3" boolean default false not null,
  "foto_subida_por_3" uuid,
  "foto_subida_at_3" timestamp with time zone,
  "stock_minimo" numeric default 0 not null,
  "punto_pedido" numeric default 0 not null,
  "estado_reposicion" text,
  "estado_reposicion_at" timestamp with time zone
);

create table public."planilla_familias" (
  "id" boolean default true not null,
  "storage_path" text not null,
  "nombre_archivo" text not null,
  "actualizada_por" uuid,
  "actualizada_at" timestamp with time zone default now() not null
);

create table public."proveedores" (
  "id" uuid default gen_random_uuid() not null,
  "nombre" text not null,
  "rubro" text,
  "email" text,
  "direccion" text,
  "localidad" text,
  "provincia" text,
  "horario" text,
  "notas" text,
  "activo" boolean default true,
  "modificado_por" text,
  "updated_at" timestamp with time zone default now(),
  "created_at" timestamp with time zone default now(),
  "codigo_postal" text default ''::text,
  "eliminado" boolean default false not null,
  "eliminado_por" uuid,
  "eliminado_at" timestamp with time zone
);

create table public."reparacion_entregas" (
  "id" uuid default gen_random_uuid() not null,
  "reparacion_item_id" uuid not null,
  "cantidad_devuelta" numeric not null,
  "resultado" text not null,
  "remito_punto_venta" text,
  "remito_numero" text,
  "remito_fecha" date,
  "fecha_entrega" date not null,
  "registrado_por" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "repone_stock" boolean default true not null
);

create table public."reparacion_items" (
  "id" uuid default gen_random_uuid() not null,
  "reparacion_id" uuid not null,
  "item_id" uuid not null,
  "cantidad" numeric not null,
  "descuenta_stock" boolean default true not null
);

create table public."reparaciones" (
  "id" uuid default gen_random_uuid() not null,
  "proveedor_id" uuid not null,
  "motivo" text not null,
  "fecha_salida" date not null,
  "responsable_id" uuid not null,
  "envio_id" uuid,
  "orden_compra_numero" text,
  "orden_compra_fecha" date,
  "activo" boolean default true not null,
  "eliminado_por" uuid,
  "eliminado_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);

create table public."retiro_items" (
  "id" uuid default gen_random_uuid() not null,
  "retiro_id" uuid not null,
  "item_id" uuid not null,
  "cantidad" numeric default 1 not null,
  "observacion" text
);

create table public."retiros" (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid not null,
  "observacion_general" text,
  "created_at" timestamp with time zone default now() not null,
  "exportado" boolean default false not null,
  "sector_id" uuid not null
);

create table public."rotulo_disenos" (
  "id" bigint generated always as identity not null,
  "nombre" text not null,
  "design" jsonb not null,
  "pie" text,
  "campos" jsonb,
  "created_at" timestamp with time zone default now() not null
);

create table public."rotulos_bultos" (
  "id" uuid default gen_random_uuid() not null,
  "rotulo_id" uuid not null,
  "numero" integer not null,
  "detalle" text,
  "storage_path" text,
  "created_at" timestamp with time zone default now() not null
);

create table public."rotulos_fotos" (
  "id" uuid default gen_random_uuid() not null,
  "grupo_id" uuid not null,
  "proveedor_id" uuid not null,
  "storage_path" text not null,
  "creado_por" uuid,
  "created_at" timestamp with time zone default now() not null
);

create table public."rotulos_generados" (
  "id" uuid default gen_random_uuid() not null,
  "proveedor_id" uuid not null,
  "tipo_documento" text,
  "numero_documento" text,
  "bulto_actual" integer,
  "bulto_total" integer,
  "storage_path" text,
  "creado_por" uuid,
  "created_at" timestamp with time zone default now() not null,
  "grupo_id" uuid not null,
  "version" integer default 1 not null,
  "vigente" boolean default true not null,
  "motivo_edicion" text,
  "detalle" text,
  "extra" text,
  "ancho_mm" numeric,
  "alto_mm" numeric,
  "valor_declarado" text,
  "comisionista_id" uuid,
  "design_snapshot" jsonb,
  "eliminado" boolean default false not null,
  "eliminado_por" uuid,
  "eliminado_at" timestamp with time zone,
  "comentario" text
);

create table public."sectores" (
  "id" uuid default gen_random_uuid() not null,
  "nombre" text not null,
  "activo" boolean default true not null,
  "created_at" timestamp with time zone default now() not null
);

create table public."subfamilias" (
  "id" uuid default gen_random_uuid() not null,
  "familia_id" uuid not null,
  "codigo" text not null,
  "nombre" text not null,
  "created_at" timestamp with time zone default now() not null
);

alter table only public."comisionistas" add constraint "comisionistas_pkey" PRIMARY KEY (id);

alter table only public."contactos" add constraint "contactos_pkey" PRIMARY KEY (id);

alter table only public."familias" add constraint "familias_pkey" PRIMARY KEY (id);

alter table only public."item_proveedores" add constraint "item_proveedores_pkey" PRIMARY KEY (id);

alter table only public."items" add constraint "items_pkey" PRIMARY KEY (id);

alter table only public."planilla_familias" add constraint "planilla_familias_pkey" PRIMARY KEY (id);

alter table only public."proveedores" add constraint "proveedores_pkey" PRIMARY KEY (id);

alter table only public."reparacion_entregas" add constraint "reparacion_entregas_pkey" PRIMARY KEY (id);

alter table only public."reparacion_items" add constraint "reparacion_items_pkey" PRIMARY KEY (id);

alter table only public."reparaciones" add constraint "reparaciones_pkey" PRIMARY KEY (id);

alter table only public."retiro_items" add constraint "retiro_items_pkey" PRIMARY KEY (id);

alter table only public."retiros" add constraint "retiros_pkey" PRIMARY KEY (id);

alter table only public."rotulo_disenos" add constraint "rotulo_disenos_pkey" PRIMARY KEY (id);

alter table only public."rotulos_bultos" add constraint "rotulos_bultos_pkey" PRIMARY KEY (id);

alter table only public."rotulos_fotos" add constraint "rotulos_fotos_pkey" PRIMARY KEY (id);

alter table only public."rotulos_generados" add constraint "rotulos_generados_pkey" PRIMARY KEY (id);

alter table only public."sectores" add constraint "sectores_pkey" PRIMARY KEY (id);

alter table only public."subfamilias" add constraint "subfamilias_pkey" PRIMARY KEY (id);

alter table only public."familias" add constraint "familias_codigo_key" UNIQUE (codigo);

alter table only public."item_proveedores" add constraint "item_proveedores_item_id_proveedor_id_key" UNIQUE (item_id, proveedor_id);

alter table only public."items" add constraint "items_codigo_key" UNIQUE (codigo);

alter table only public."sectores" add constraint "sectores_nombre_key" UNIQUE (nombre);

alter table only public."subfamilias" add constraint "subfamilias_familia_id_codigo_key" UNIQUE (familia_id, codigo);

alter table only public."familias" add constraint "familias_codigo_check" CHECK (((char_length(codigo) = 2) AND (codigo = upper(codigo))));

alter table only public."items" add constraint "items_estado_reposicion_check" CHECK ((estado_reposicion = ANY (ARRAY['presupuesto'::text, 'compras'::text])));

alter table only public."items" add constraint "items_punto_pedido_check" CHECK ((punto_pedido >= (0)::numeric));

alter table only public."items" add constraint "items_stock_minimo_check" CHECK ((stock_minimo >= (0)::numeric));

alter table only public."planilla_familias" add constraint "solo_una_fila" CHECK ((id = true));

alter table only public."reparacion_entregas" add constraint "reparacion_entregas_cantidad_devuelta_check" CHECK ((cantidad_devuelta > (0)::numeric));

alter table only public."reparacion_entregas" add constraint "reparacion_entregas_resultado_check" CHECK ((resultado = ANY (ARRAY['reparado'::text, 'baja'::text])));

alter table only public."reparacion_items" add constraint "reparacion_items_cantidad_check" CHECK ((cantidad > (0)::numeric));

alter table only public."subfamilias" add constraint "subfamilias_codigo_check" CHECK (((char_length(codigo) = 2) AND (codigo = upper(codigo))));

alter table only public."configuracion" add constraint "configuracion_rotulo_diseno_id_fkey" FOREIGN KEY (rotulo_diseno_id) REFERENCES rotulo_disenos(id) ON DELETE SET NULL;

alter table only public."contactos" add constraint "contactos_proveedor_id_fkey" FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE;

alter table only public."item_proveedores" add constraint "item_proveedores_item_id_fkey" FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;

alter table only public."item_proveedores" add constraint "item_proveedores_proveedor_id_fkey" FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE;

alter table only public."items" add constraint "items_eliminado_por_fkey" FOREIGN KEY (eliminado_por) REFERENCES usuarios_perfil(id);

alter table only public."items" add constraint "items_familia_id_fkey" FOREIGN KEY (familia_id) REFERENCES familias(id) ON DELETE RESTRICT;

alter table only public."items" add constraint "items_foto_subida_por_2_fkey" FOREIGN KEY (foto_subida_por_2) REFERENCES usuarios_perfil(id);

alter table only public."items" add constraint "items_foto_subida_por_3_fkey" FOREIGN KEY (foto_subida_por_3) REFERENCES usuarios_perfil(id);

alter table only public."items" add constraint "items_foto_subida_por_fkey" FOREIGN KEY (foto_subida_por) REFERENCES usuarios_perfil(id);

alter table only public."items" add constraint "items_subfamilia_id_fkey" FOREIGN KEY (subfamilia_id) REFERENCES subfamilias(id) ON DELETE RESTRICT;

alter table only public."planilla_familias" add constraint "planilla_familias_actualizada_por_fkey" FOREIGN KEY (actualizada_por) REFERENCES usuarios_perfil(id);

alter table only public."proveedores" add constraint "proveedores_eliminado_por_fkey" FOREIGN KEY (eliminado_por) REFERENCES usuarios_perfil(id);

alter table only public."reparacion_entregas" add constraint "reparacion_entregas_registrado_por_fkey" FOREIGN KEY (registrado_por) REFERENCES usuarios_perfil(id);

alter table only public."reparacion_entregas" add constraint "reparacion_entregas_reparacion_item_id_fkey" FOREIGN KEY (reparacion_item_id) REFERENCES reparacion_items(id) ON DELETE CASCADE;

alter table only public."reparacion_items" add constraint "reparacion_items_item_id_fkey" FOREIGN KEY (item_id) REFERENCES items(id);

alter table only public."reparacion_items" add constraint "reparacion_items_reparacion_id_fkey" FOREIGN KEY (reparacion_id) REFERENCES reparaciones(id) ON DELETE CASCADE;

alter table only public."reparaciones" add constraint "reparaciones_eliminado_por_fkey" FOREIGN KEY (eliminado_por) REFERENCES usuarios_perfil(id);

alter table only public."reparaciones" add constraint "reparaciones_envio_id_fkey" FOREIGN KEY (envio_id) REFERENCES rotulos_generados(id);

alter table only public."reparaciones" add constraint "reparaciones_proveedor_id_fkey" FOREIGN KEY (proveedor_id) REFERENCES proveedores(id);

alter table only public."reparaciones" add constraint "reparaciones_responsable_id_fkey" FOREIGN KEY (responsable_id) REFERENCES usuarios_perfil(id);

alter table only public."retiro_items" add constraint "retiro_items_item_id_fkey" FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT;

alter table only public."retiro_items" add constraint "retiro_items_retiro_id_fkey" FOREIGN KEY (retiro_id) REFERENCES retiros(id) ON DELETE CASCADE;

alter table only public."retiros" add constraint "retiros_sector_id_fkey" FOREIGN KEY (sector_id) REFERENCES sectores(id);

alter table only public."retiros" add constraint "retiros_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES auth.users(id);

alter table only public."rotulos_bultos" add constraint "rotulos_bultos_rotulo_id_fkey" FOREIGN KEY (rotulo_id) REFERENCES rotulos_generados(id) ON DELETE CASCADE;

alter table only public."rotulos_fotos" add constraint "rotulos_fotos_creado_por_fkey" FOREIGN KEY (creado_por) REFERENCES usuarios_perfil(id);

alter table only public."rotulos_fotos" add constraint "rotulos_fotos_proveedor_id_fkey" FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE;

alter table only public."rotulos_generados" add constraint "rotulos_generados_comisionista_id_fkey" FOREIGN KEY (comisionista_id) REFERENCES comisionistas(id);

alter table only public."rotulos_generados" add constraint "rotulos_generados_creado_por_fkey" FOREIGN KEY (creado_por) REFERENCES usuarios_perfil(id);

alter table only public."rotulos_generados" add constraint "rotulos_generados_eliminado_por_fkey" FOREIGN KEY (eliminado_por) REFERENCES usuarios_perfil(id);

alter table only public."rotulos_generados" add constraint "rotulos_generados_proveedor_id_fkey" FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE;

alter table only public."subfamilias" add constraint "subfamilias_familia_id_fkey" FOREIGN KEY (familia_id) REFERENCES familias(id) ON DELETE RESTRICT;

-- ======================================================================
-- Índices
-- ======================================================================

CREATE INDEX item_proveedores_item_idx ON public.item_proveedores USING btree (item_id);

CREATE INDEX item_proveedores_proveedor_idx ON public.item_proveedores USING btree (proveedor_id);

CREATE INDEX items_codigo_trgm_idx ON public.items USING gin (codigo gin_trgm_ops);

CREATE INDEX items_descripcion_trgm_idx ON public.items USING gin (descripcion gin_trgm_ops);

CREATE INDEX items_numero_idx ON public.items USING btree (numero);

CREATE OR REPLACE FUNCTION public.ajustar_stock_por_retiro_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update items set stock = coalesce(stock, 0) - new.cantidad where id = new.item_id;
  elsif tg_op = 'UPDATE' then
    update items set stock = coalesce(stock, 0) + old.cantidad - new.cantidad where id = new.item_id;
  elsif tg_op = 'DELETE' then
    update items set stock = coalesce(stock, 0) + old.cantidad where id = old.item_id;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.crear_reparacion(p_proveedor_id uuid, p_motivo text, p_fecha_salida date, p_envio_id uuid, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reparacion_id uuid;
  v_item jsonb;
begin
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Agregá al menos un artículo';
  end if;

  insert into reparaciones (proveedor_id, motivo, fecha_salida, responsable_id, envio_id)
  values (p_proveedor_id, p_motivo, p_fecha_salida, auth.uid(), p_envio_id)
  returning id into v_reparacion_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into reparacion_items (reparacion_id, item_id, cantidad, descuenta_stock)
    values (v_reparacion_id, (v_item->>'item_id')::uuid, (v_item->>'cantidad')::numeric, coalesce((v_item->>'descuenta_stock')::boolean, true));
  end loop;

  return v_reparacion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.eliminar_reparacion(p_reparacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_linea record;
  v_pendiente numeric;
begin
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;

  for v_linea in select id, item_id from reparacion_items where reparacion_id = p_reparacion_id and descuenta_stock loop
    v_pendiente := reparacion_item_pendiente(v_linea.id);
    if v_pendiente > 0 then
      update items set stock = coalesce(stock, 0) + v_pendiente where id = v_linea.item_id;
    end if;
  end loop;

  update reparaciones set activo = false, eliminado_por = auth.uid(), eliminado_at = now() where id = p_reparacion_id;
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

CREATE OR REPLACE FUNCTION public.fn_audit_log_reparaciones()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil record;
  v_desc text;
  v_row record;
begin
  select nombre, apellido, email into v_perfil from usuarios_perfil where id = auth.uid();
  v_row := coalesce(new, old);

  if tg_table_name = 'reparaciones' then
    v_desc := (case when tg_op = 'DELETE' then old.motivo else new.motivo end);
  elsif tg_table_name = 'reparacion_items' then
    select concat(codigo, ' x', v_row.cantidad) into v_desc from items where id = v_row.item_id;
  elsif tg_table_name = 'reparacion_entregas' then
    v_desc := concat('Entrega ', v_row.resultado, ' — ', v_row.cantidad_devuelta, ' unidad(es)');
  end if;

  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    tg_table_name,
    v_row.id::text,
    v_desc,
    lower(tg_op),
    auth.uid(),
    nullif(trim(coalesce(v_perfil.nombre, '') || ' ' || coalesce(v_perfil.apellido, '')), ''),
    v_perfil.email,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_audit_log_retiro_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_perfil record;
  v_dueno record;
  v_codigo text;
begin
  select nombre, apellido, email into v_perfil from usuarios_perfil where id = auth.uid();

  select codigo into v_codigo from items where id = old.item_id;

  select p.nombre, p.apellido into v_dueno
  from retiros r join usuarios_perfil p on p.id = r.usuario_id
  where r.id = old.retiro_id;

  insert into audit_log (tabla, registro_id, descripcion, accion, usuario_id, usuario_nombre, usuario_email, datos_anteriores, datos_nuevos)
  values (
    'retiro_items',
    old.id::text,
    concat(
      coalesce(v_codigo, 'Repuesto'), ' x', old.cantidad,
      case when tg_op = 'UPDATE' then concat(' → x', new.cantidad) else '' end,
      case when v_dueno.nombre is not null
        then concat(' — retiro de ', trim(concat(v_dueno.nombre, ' ', coalesce(v_dueno.apellido, ''))))
        else '' end
    ),
    lower(tg_op),
    auth.uid(),
    nullif(trim(coalesce(v_perfil.nombre, '') || ' ' || coalesce(v_perfil.apellido, '')), ''),
    v_perfil.email,
    to_jsonb(old),
    case when tg_op = 'UPDATE' then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.historial_retiros_por_item(p_item_id uuid)
 RETURNS TABLE(id uuid, cantidad numeric, observacion text, created_at timestamp with time zone, usuario_id uuid, sector text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ri.id, ri.cantidad, ri.observacion, r.created_at, r.usuario_id, s.nombre as sector
  from retiro_items ri
  join retiros r on r.id = ri.retiro_id
  left join sectores s on s.id = r.sector_id
  where ri.item_id = p_item_id
    and exists (
      select 1 from usuarios_perfil up
      where up.id = auth.uid() and (up.mantenimiento_rol is not null or is_owner())
    )
  order by r.created_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.items_trg_estado_reposicion()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.estado_reposicion is null
     or new.stock_minimo <= 0
     or coalesce(new.stock, 0) > new.punto_pedido then
    new.estado_reposicion := null;
    new.estado_reposicion_at := null;
  elsif new.estado_reposicion is distinct from old.estado_reposicion then
    new.estado_reposicion_at := now();
  end if;
  return new;
end;
$function$;

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
        NEW.ubicacion, NEW.stock, NEW.detalles, NEW.activo)
       is distinct from
       (OLD.codigo, OLD.familia_id, OLD.subfamilia_id, OLD.numero, OLD.descripcion,
        OLD.ubicacion, OLD.stock, OLD.detalles, OLD.activo)
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

CREATE OR REPLACE FUNCTION public.reparacion_entregas_trg_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item_id uuid;
begin
  if old.resultado = 'reparado' and old.repone_stock then
    select item_id into v_item_id from reparacion_items where id = old.reparacion_item_id;
    update items set stock = coalesce(stock, 0) - old.cantidad_devuelta where id = v_item_id;
  end if;
  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reparacion_entregas_trg_validar_y_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pendiente numeric;
  v_item_id uuid;
begin
  select reparacion_item_pendiente(new.reparacion_item_id) into v_pendiente;
  if new.cantidad_devuelta > v_pendiente then
    raise exception 'No podés registrar %, quedan % pendientes en esa línea.', new.cantidad_devuelta, v_pendiente;
  end if;

  if new.resultado = 'reparado' and new.repone_stock then
    select item_id into v_item_id from reparacion_items where id = new.reparacion_item_id;
    update items set stock = coalesce(stock, 0) + new.cantidad_devuelta where id = v_item_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reparacion_item_pendiente(p_reparacion_item_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ri.cantidad - coalesce((select sum(re.cantidad_devuelta) from reparacion_entregas re where re.reparacion_item_id = ri.id), 0)
  from reparacion_items ri
  where ri.id = p_reparacion_item_id;
$function$;

CREATE OR REPLACE FUNCTION public.reparacion_items_trg_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.descuenta_stock then
      update items set stock = coalesce(stock, 0) - new.cantidad where id = new.item_id;
    end if;
    return new;
  end if;

  if exists (select 1 from reparacion_entregas where reparacion_item_id = old.id) then
    raise exception 'Esta línea ya tiene una entrega registrada — borrala primero para poder modificarla.';
  end if;

  if tg_op = 'UPDATE' then
    if new.descuenta_stock then
      update items set stock = coalesce(stock, 0) - (new.cantidad - old.cantidad) where id = new.item_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.descuenta_stock then
      update items set stock = coalesce(stock, 0) + old.cantidad where id = old.item_id;
    end if;
    return old;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restaurar_reparacion(p_reparacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_linea record;
  v_pendiente numeric;
begin
  if not is_mantenimiento_admin() then
    raise exception 'No autorizado';
  end if;

  for v_linea in select id, item_id from reparacion_items where reparacion_id = p_reparacion_id and descuenta_stock loop
    v_pendiente := reparacion_item_pendiente(v_linea.id);
    if v_pendiente > 0 then
      update items set stock = coalesce(stock, 0) - v_pendiente where id = v_linea.item_id;
    end if;
  end loop;

  update reparaciones set activo = true, eliminado_por = null, eliminado_at = null where id = p_reparacion_id;
end;
$function$;

CREATE TRIGGER trg_audit_comisionistas AFTER INSERT OR DELETE OR UPDATE ON public.comisionistas FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_contactos AFTER INSERT OR DELETE OR UPDATE ON public.contactos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER items_set_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_items_delete AFTER DELETE ON public.items FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION fn_audit_log_items();

CREATE TRIGGER trg_audit_items_insert AFTER INSERT ON public.items FOR EACH ROW WHEN ((pg_trigger_depth() = 0)) EXECUTE FUNCTION fn_audit_log_items();

CREATE TRIGGER trg_audit_items_update AFTER UPDATE OF codigo, numero, descripcion, familia_id, subfamilia_id, ubicacion, stock, detalles, stock_minimo, punto_pedido, activo ON public.items FOR EACH ROW WHEN (((pg_trigger_depth() = 0) AND (((((((((((old.codigo IS DISTINCT FROM new.codigo) OR (old.numero IS DISTINCT FROM new.numero)) OR (old.descripcion IS DISTINCT FROM new.descripcion)) OR (old.familia_id IS DISTINCT FROM new.familia_id)) OR (old.subfamilia_id IS DISTINCT FROM new.subfamilia_id)) OR (old.ubicacion IS DISTINCT FROM new.ubicacion)) OR (old.stock IS DISTINCT FROM new.stock)) OR (old.detalles IS DISTINCT FROM new.detalles)) OR (old.stock_minimo IS DISTINCT FROM new.stock_minimo)) OR (old.punto_pedido IS DISTINCT FROM new.punto_pedido)) OR (old.activo IS DISTINCT FROM new.activo)))) EXECUTE FUNCTION fn_audit_log_items();

CREATE TRIGGER trg_items_estado_reposicion BEFORE UPDATE OF stock, stock_minimo, punto_pedido, estado_reposicion ON public.items FOR EACH ROW EXECUTE FUNCTION items_trg_estado_reposicion();

CREATE TRIGGER trg_items_fotos_pendientes BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION items_trg_fotos_pendientes();

CREATE TRIGGER trg_audit_proveedores AFTER INSERT OR DELETE OR UPDATE ON public.proveedores FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_audit_reparacion_entregas AFTER INSERT OR DELETE ON public.reparacion_entregas FOR EACH ROW EXECUTE FUNCTION fn_audit_log_reparaciones();

CREATE TRIGGER trg_reparacion_entregas_delete BEFORE DELETE ON public.reparacion_entregas FOR EACH ROW EXECUTE FUNCTION reparacion_entregas_trg_delete();

CREATE TRIGGER trg_reparacion_entregas_validar BEFORE INSERT ON public.reparacion_entregas FOR EACH ROW EXECUTE FUNCTION reparacion_entregas_trg_validar_y_stock();

CREATE TRIGGER trg_audit_reparacion_items AFTER INSERT OR DELETE OR UPDATE ON public.reparacion_items FOR EACH ROW EXECUTE FUNCTION fn_audit_log_reparaciones();

CREATE TRIGGER trg_reparacion_items_stock BEFORE DELETE OR UPDATE ON public.reparacion_items FOR EACH ROW EXECUTE FUNCTION reparacion_items_trg_stock();

CREATE TRIGGER trg_reparacion_items_stock_insert AFTER INSERT ON public.reparacion_items FOR EACH ROW EXECUTE FUNCTION reparacion_items_trg_stock();

CREATE TRIGGER trg_audit_reparaciones AFTER INSERT OR DELETE OR UPDATE ON public.reparaciones FOR EACH ROW EXECUTE FUNCTION fn_audit_log_reparaciones();

CREATE TRIGGER trg_ajustar_stock_retiro_item AFTER INSERT OR DELETE OR UPDATE OF cantidad ON public.retiro_items FOR EACH ROW EXECUTE FUNCTION ajustar_stock_por_retiro_item();

CREATE TRIGGER trg_audit_retiro_items_delete AFTER DELETE ON public.retiro_items FOR EACH ROW EXECUTE FUNCTION fn_audit_log_retiro_items();

CREATE TRIGGER trg_audit_retiro_items_update AFTER UPDATE OF cantidad ON public.retiro_items FOR EACH ROW WHEN ((old.cantidad IS DISTINCT FROM new.cantidad)) EXECUTE FUNCTION fn_audit_log_retiro_items();

alter table public."comisionistas" enable row level security;

alter table public."contactos" enable row level security;

alter table public."familias" enable row level security;

alter table public."item_proveedores" enable row level security;

alter table public."items" enable row level security;

alter table public."planilla_familias" enable row level security;

alter table public."proveedores" enable row level security;

alter table public."reparacion_entregas" enable row level security;

alter table public."reparacion_items" enable row level security;

alter table public."reparaciones" enable row level security;

alter table public."retiro_items" enable row level security;

alter table public."retiros" enable row level security;

alter table public."rotulo_disenos" enable row level security;

alter table public."rotulos_bultos" enable row level security;

alter table public."rotulos_fotos" enable row level security;

alter table public."rotulos_generados" enable row level security;

alter table public."sectores" enable row level security;

alter table public."subfamilias" enable row level security;

create policy "autenticados pueden leer" on public."comisionistas"
  as permissive for select to authenticated
  using (true);

create policy "comisionistas_delete" on public."comisionistas"
  as permissive for delete to public
  using (is_directorio_admin());

create policy "comisionistas_insert" on public."comisionistas"
  as permissive for insert to public
  with check (is_directorio_admin());

create policy "comisionistas_update" on public."comisionistas"
  as permissive for update to public
  using (is_directorio_admin())
  with check (is_directorio_admin());

create policy "contactos_delete" on public."contactos"
  as permissive for delete to public
  using (is_directorio_admin());

create policy "contactos_insert" on public."contactos"
  as permissive for insert to public
  with check (is_directorio_admin());

create policy "contactos_select" on public."contactos"
  as permissive for select to public
  using (true);

create policy "contactos_update" on public."contactos"
  as permissive for update to public
  using (is_directorio_admin())
  with check (is_directorio_admin());

create policy "familias_delete" on public."familias"
  as permissive for delete to public
  using (is_owner());

create policy "familias_insert" on public."familias"
  as permissive for insert to public
  with check (is_mantenimiento_admin());

create policy "familias_select" on public."familias"
  as permissive for select to authenticated
  using (true);

create policy "familias_update" on public."familias"
  as permissive for update to public
  using (is_owner())
  with check (is_owner());

create policy "item_proveedores_delete" on public."item_proveedores"
  as permissive for delete to authenticated
  using (is_mantenimiento_admin());

create policy "item_proveedores_insert" on public."item_proveedores"
  as permissive for insert to authenticated
  with check (is_mantenimiento_admin());

create policy "item_proveedores_select" on public."item_proveedores"
  as permissive for select to authenticated
  using (is_mantenimiento_admin());

create policy "items_delete" on public."items"
  as permissive for delete to authenticated
  using (is_owner());

create policy "items_insert" on public."items"
  as permissive for insert to authenticated
  with check (is_mantenimiento_admin());

create policy "items_select" on public."items"
  as permissive for select to authenticated
  using (true);

create policy "items_update" on public."items"
  as permissive for update to authenticated
  using (tiene_acceso_mantenimiento())
  with check (tiene_acceso_mantenimiento());

create policy "planilla_familias_select" on public."planilla_familias"
  as permissive for select to public
  using (true);

create policy "planilla_familias_update" on public."planilla_familias"
  as permissive for update to public
  using (is_mantenimiento_admin())
  with check (is_mantenimiento_admin());

create policy "planilla_familias_upsert" on public."planilla_familias"
  as permissive for insert to public
  with check (is_mantenimiento_admin());

create policy "proveedores_delete" on public."proveedores"
  as permissive for delete to authenticated
  using (is_owner());

create policy "proveedores_insert" on public."proveedores"
  as permissive for insert to authenticated
  with check (is_directorio_admin());

create policy "proveedores_select" on public."proveedores"
  as permissive for select to authenticated
  using (true);

create policy "proveedores_update" on public."proveedores"
  as permissive for update to authenticated
  using (is_directorio_admin())
  with check (is_directorio_admin());

create policy "reparacion_entregas_delete" on public."reparacion_entregas"
  as permissive for delete to authenticated
  using (is_mantenimiento_admin());

create policy "reparacion_entregas_insert" on public."reparacion_entregas"
  as permissive for insert to authenticated
  with check (is_mantenimiento_admin());

create policy "reparacion_entregas_select" on public."reparacion_entregas"
  as permissive for select to authenticated
  using (is_mantenimiento_admin());

create policy "reparacion_items_delete" on public."reparacion_items"
  as permissive for delete to authenticated
  using (is_mantenimiento_admin());

create policy "reparacion_items_insert" on public."reparacion_items"
  as permissive for insert to authenticated
  with check (is_mantenimiento_admin());

create policy "reparacion_items_select" on public."reparacion_items"
  as permissive for select to authenticated
  using (is_mantenimiento_admin());

create policy "reparacion_items_update" on public."reparacion_items"
  as permissive for update to authenticated
  using (is_mantenimiento_admin())
  with check (is_mantenimiento_admin());

create policy "reparaciones_delete" on public."reparaciones"
  as permissive for delete to authenticated
  using (is_owner());

create policy "reparaciones_insert" on public."reparaciones"
  as permissive for insert to authenticated
  with check (is_mantenimiento_admin());

create policy "reparaciones_select" on public."reparaciones"
  as permissive for select to authenticated
  using (is_mantenimiento_admin());

create policy "reparaciones_update" on public."reparaciones"
  as permissive for update to authenticated
  using (is_mantenimiento_admin())
  with check (is_mantenimiento_admin());

create policy "retiro_items_delete" on public."retiro_items"
  as permissive for delete to authenticated
  using ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND (can_view_all_retiros() OR ((r.usuario_id = auth.uid()) AND (r.created_at > (now() - '24:00:00'::interval))))))));

create policy "retiro_items_insert" on public."retiro_items"
  as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND (r.usuario_id = auth.uid())))));

create policy "retiro_items_select" on public."retiro_items"
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND ((r.usuario_id = auth.uid()) OR can_view_all_retiros())))));

create policy "retiro_items_update" on public."retiro_items"
  as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND (can_view_all_retiros() OR ((r.usuario_id = auth.uid()) AND (r.created_at > (now() - '24:00:00'::interval))))))))
  with check ((EXISTS ( SELECT 1
   FROM retiros r
  WHERE ((r.id = retiro_items.retiro_id) AND (can_view_all_retiros() OR ((r.usuario_id = auth.uid()) AND ((r.created_at)::date = ((now() AT TIME ZONE 'utc'::text))::date)))))));

create policy "retiros_delete" on public."retiros"
  as permissive for delete to authenticated
  using ((can_view_all_retiros() OR ((usuario_id = auth.uid()) AND (created_at > (now() - '24:00:00'::interval)))));

create policy "retiros_insert" on public."retiros"
  as permissive for insert to authenticated
  with check ((usuario_id = auth.uid()));

create policy "retiros_select" on public."retiros"
  as permissive for select to authenticated
  using (((usuario_id = auth.uid()) OR can_view_all_retiros()));

create policy "retiros_update" on public."retiros"
  as permissive for update to authenticated
  using ((can_view_all_retiros() OR ((usuario_id = auth.uid()) AND (created_at > (now() - '24:00:00'::interval)))))
  with check ((can_view_all_retiros() OR ((usuario_id = auth.uid()) AND ((created_at)::date = ((now() AT TIME ZONE 'utc'::text))::date))));

create policy "rotulo_disenos_select" on public."rotulo_disenos"
  as permissive for select to authenticated
  using (true);

create policy "rotulo_disenos_write_admin" on public."rotulo_disenos"
  as permissive for all to authenticated
  using (is_directorio_admin())
  with check (is_directorio_admin());

create policy "rotulos_bultos_insert" on public."rotulos_bultos"
  as permissive for insert to authenticated
  with check (true);

create policy "rotulos_bultos_select" on public."rotulos_bultos"
  as permissive for select to authenticated
  using (true);

create policy "rotulos_fotos_delete" on public."rotulos_fotos"
  as permissive for delete to authenticated
  using (true);

create policy "rotulos_fotos_insert" on public."rotulos_fotos"
  as permissive for insert to authenticated
  with check (true);

create policy "rotulos_fotos_select" on public."rotulos_fotos"
  as permissive for select to authenticated
  using (true);

create policy "rotulos_generados_delete_owner" on public."rotulos_generados"
  as permissive for delete to public
  using (is_owner());

create policy "rotulos_generados_insert" on public."rotulos_generados"
  as permissive for insert to authenticated
  with check (true);

create policy "rotulos_generados_select" on public."rotulos_generados"
  as permissive for select to authenticated
  using (true);

create policy "rotulos_generados_update_admin" on public."rotulos_generados"
  as permissive for update to authenticated
  using (is_directorio_admin())
  with check (is_directorio_admin());

create policy "sectores_select" on public."sectores"
  as permissive for select to authenticated
  using (true);

create policy "sectores_write" on public."sectores"
  as permissive for all to authenticated
  using (is_mantenimiento_admin())
  with check (is_mantenimiento_admin());

create policy "subfamilias_delete" on public."subfamilias"
  as permissive for delete to public
  using (is_owner());

create policy "subfamilias_insert" on public."subfamilias"
  as permissive for insert to public
  with check (is_mantenimiento_admin());

create policy "subfamilias_select" on public."subfamilias"
  as permissive for select to authenticated
  using (true);

create policy "subfamilias_update" on public."subfamilias"
  as permissive for update to public
  using (is_owner())
  with check (is_owner());

create policy "authenticated_delete_rotulos_storage" on storage."objects"
  as permissive for delete to authenticated
  using (((bucket_id = 'rotulos'::text) AND (EXISTS ( SELECT 1
   FROM usuarios_perfil
  WHERE ((usuarios_perfil.id = auth.uid()) AND (usuarios_perfil.rol = 'admin'::text))))));

create policy "authenticated_upload_rotulos_storage" on storage."objects"
  as permissive for insert to authenticated
  with check ((bucket_id = 'rotulos'::text));

create policy "items_photos_select" on storage."objects"
  as permissive for select to public
  using ((bucket_id = 'items'::text));

create policy "items_photos_write" on storage."objects"
  as permissive for all to authenticated
  using (((bucket_id = 'items'::text) AND tiene_acceso_mantenimiento()))
  with check (((bucket_id = 'items'::text) AND tiene_acceso_mantenimiento()));

create policy "public_read_rotulos_storage" on storage."objects"
  as permissive for select to public
  using ((bucket_id = 'rotulos'::text));

insert into storage.buckets (id, name, public) values ('items', 'items', true) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('rotulos', 'rotulos', true) on conflict (id) do nothing;

revoke execute on function public."crear_reparacion"(p_proveedor_id uuid, p_motivo text, p_fecha_salida date, p_envio_id uuid, p_items jsonb) from public, anon;

revoke execute on function public."eliminar_reparacion"(p_reparacion_id uuid) from public, anon;

revoke execute on function public."historial_retiros_por_item"(p_item_id uuid) from public, anon;

revoke execute on function public."reparacion_item_pendiente"(p_reparacion_item_id uuid) from public, anon;

revoke execute on function public."restaurar_reparacion"(p_reparacion_id uuid) from public, anon;
