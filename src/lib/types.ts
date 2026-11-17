import type { Database } from './database.types';

// Fila de usuarios_perfil, tipada desde el esquema real. Dos ejes de permiso
// independientes (rol / mantenimiento_rol) más tres flags sueltos — ver el plan
// de migración: esto es diseño deliberado, no simplificar.
export type Profile = Database['public']['Tables']['usuarios_perfil']['Row'];

// "Dueño del sistema" es un dato (usuarios_perfil.es_owner), no un email
// hardcodeado — se puede transferir desde Admin → Usuarios sin tocar código.
export function isOwner(profile: Profile | null): boolean {
  return profile?.es_owner === true;
}

export function isDirectorioAdmin(profile: Profile | null): boolean {
  return profile?.rol === 'admin' || isOwner(profile);
}

export function isDirectorioDesactivado(profile: Profile | null): boolean {
  return profile?.rol === 'disabled' && !isOwner(profile);
}

export function isDepositoAdmin(profile: Profile | null): boolean {
  return profile?.mantenimiento_rol === 'admin' || isOwner(profile);
}

export function tieneAccesoDeposito(profile: Profile | null): boolean {
  return profile?.mantenimiento_rol != null || isDepositoAdmin(profile);
}

// Mantenimiento (los equipos y su ficha) tiene sus propios roles en rol_equipos (mantenimiento_rol, por un nombre viejo, es el del Depósito):
// admin (el responsable de mantenimiento), jefe (jefe de taller), tecnico o consulta. Igual que puede_ver_equipos(), trabaja_en_equipos(),
// jefe_de_taller() y administra_equipos() en la base, que lo impone.
export function puedeVerEquipos(profile: Profile | null): boolean {
  return profile?.rol_equipos != null || isOwner(profile);
}

export function trabajaEnEquipos(profile: Profile | null): boolean {
  return profile?.rol_equipos === 'admin' || profile?.rol_equipos === 'jefe' || profile?.rol_equipos === 'tecnico' || isOwner(profile);
}

/** Asigna las OT a los técnicos y las revisa: el jefe de taller (y el responsable y el dueño, para que nada se trabe si no hay jefe). */
export function esJefeDeTaller(profile: Profile | null): boolean {
  return profile?.rol_equipos === 'jefe' || profile?.rol_equipos === 'admin' || isOwner(profile);
}

/** El perfil en el circuito de las OT: el dueño y el administrador son el responsable de mantenimiento. */
export function rolDeMantenimiento(profile: Profile | null): 'responsable' | 'jefe' | 'tecnico' | 'consulta' {
  if (isOwner(profile) || profile?.rol_equipos === 'admin') return 'responsable';
  if (profile?.rol_equipos === 'jefe') return 'jefe';
  if (profile?.rol_equipos === 'tecnico') return 'tecnico';
  return 'consulta';
}

export function administraEquipos(profile: Profile | null): boolean {
  return profile?.rol_equipos === 'admin' || isOwner(profile);
}

export function puedeVerTodosLosRetiros(profile: Profile | null): boolean {
  return profile?.puede_ver_retiros === true || isOwner(profile);
}

export function puedeVerErrores(profile: Profile | null): boolean {
  return profile?.puede_ver_errores === true || isOwner(profile);
}

export function puedeResetearContrasenas(profile: Profile | null): boolean {
  return profile?.puede_resetear_contrasenas === true || isOwner(profile);
}

// Ajustar el inventario (sumar o restar stock de varios repuestos de una vez): lo hacen los dueños y los administradores
// del Depósito a quienes un dueño les dio el permiso. La base lo impone igual; esto solo muestra u oculta la pantalla.
export function puedeAjustarInventario(profile: Profile | null): boolean {
  return isOwner(profile) || (profile?.mantenimiento_rol === 'admin' && profile?.puede_ajustar_inventario === true);
}

// El administrador de Compras (la columna sigue llamándose puede_gestionar_depositos): crea y edita depósitos, decide cómo trabaja cada uno
// y ve el Informe de reposición. Lo tienen los dueños y quien un dueño autorizó. La base lo impone igual; esto solo muestra u oculta la pantalla.
export function puedeGestionarDepositos(profile: Profile | null): boolean {
  return isOwner(profile) || profile?.puede_gestionar_depositos === true;
}

// El Informe de reposición es de Compras: lo ven los dueños, el administrador de Compras y quien tenga el permiso (alguien del depósito que
// también compra). Igual que can_ver_informe() en la base.
export function puedeVerInforme(profile: Profile | null): boolean {
  return puedeGestionarDepositos(profile) || (profile?.puede_ver_informe === true && profile?.mantenimiento_rol != null);
}

// El calendario de Mantenimiento (pedido del dueño, 12/11/2026): los dueños y, con un rol en Mantenimiento, quien un dueño autorizó.
// Oculta la pantalla: las OT y las rutinas se siguen viendo en Órdenes de trabajo y en la ficha del equipo.
export function puedeVerCalendario(profile: Profile | null): boolean {
  return isOwner(profile) || (profile?.puede_ver_calendario === true && profile?.rol_equipos != null);
}

// Ver el historial de actividad (Configuración → Historial): los dueños y quien un dueño autorizó. La base decide qué filas ve cada uno.
export function puedeVerAuditoria(profile: Profile | null): boolean {
  return isOwner(profile) || profile?.puede_ver_auditoria === true;
}

export function puedeVerSugerencias(profile: Profile | null): boolean {
  return profile?.puede_ver_sugerencias === true || isOwner(profile);
}

// Espeja tieneAccesoAdmin() de mantenimiento.js: decide si el botón compartido
// "Configuración" se muestra, sin importar por cuál de los permisos sea.
// puede_resetear_contrasenas se suma acá (no existía en la app vieja) para que
// alguien con SOLO ese permiso pueda llegar a la pestaña Usuarios.
export function tieneAccesoAdmin(profile: Profile | null): boolean {
  return isDirectorioAdmin(profile) || isDepositoAdmin(profile) || puedeVerErrores(profile) || puedeResetearContrasenas(profile) || puedeVerSugerencias(profile) || puedeGestionarDepositos(profile) || puedeVerAuditoria(profile)
    || administraEquipos(profile);
}
