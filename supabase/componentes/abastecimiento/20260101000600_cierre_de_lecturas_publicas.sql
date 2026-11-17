-- Parte "abastecimiento" de supabase/migrations/20260101000600_cierre_de_lecturas_publicas.sql (generado por scripts/herramientas/repartir.mjs).
-- Se aplica después de la parte de los componentes anteriores (base → abastecimiento → mantenimiento).

-- Sin sesión solo se puede leer la configuración de la empresa (nombre, logo y colores del ingreso).
--
-- Hallazgo de la prueba exhaustiva: las reglas de lectura de "contactos" y "planilla_familias" estaban abiertas
-- al público y la clave pública va dentro del código de la página, así que cualquiera podía bajar los contactos
-- de los proveedores (nombre, cargo, teléfono y mail). Además, el rol sin sesión ("anon") tenía todos los permisos
-- de tabla y dependía solo de las reglas de fila.

alter policy contactos_select on public.contactos to authenticated;

alter policy planilla_familias_select on public.planilla_familias to authenticated;

-- Sin sesión no hace falta ningún permiso de tabla, salvo leer la configuración.
revoke all on table public."comisionistas", public."contactos", public."familias", public."item_proveedores", public."items", public."planilla_familias", public."proveedores", public."reparacion_entregas", public."reparacion_items", public."reparaciones", public."retiro_items", public."retiros", public."rotulo_disenos", public."rotulos_bultos", public."rotulos_fotos", public."rotulos_generados", public."sectores", public."subfamilias" from anon;

revoke all on all sequences in schema public from anon;
