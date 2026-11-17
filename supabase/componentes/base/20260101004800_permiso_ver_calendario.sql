-- Permiso nuevo "Ver el calendario" de Mantenimiento (pedido del dueño, 12/11/2026): por defecto solo lo ven los dueños; a los demás se lo
-- da un dueño, por persona, desde Configuración → Usuarios (grupo Mantenimiento). Hace falta además tener un rol en Mantenimiento.
-- Oculta la pantalla del calendario: las OT y las rutinas que muestra se siguen viendo donde ya se veían (Órdenes de trabajo, la ficha del
-- equipo), así que no hay datos que cerrar en la base.

alter table public.usuarios_perfil add column if not exists puede_ver_calendario boolean not null default false;

-- (la protección del permiso y el historial van en el componente de Mantenimiento, …004800_permiso_ver_calendario.sql: se instala
-- después del Depósito, que también redefine la protección, y así no la pisa)
