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

// Crear y editar depósitos: los dueños y quien un dueño autorizó. La base lo impone igual; esto solo muestra u oculta la pantalla.
export function puedeGestionarDepositos(profile: Profile | null): boolean {
  return isOwner(profile) || profile?.puede_gestionar_depositos === true;
}

export function puedeVerSugerencias(profile: Profile | null): boolean {
  return profile?.puede_ver_sugerencias === true || isOwner(profile);
}

// Espeja tieneAccesoAdmin() de mantenimiento.js: decide si el botón compartido
// "Configuración" se muestra, sin importar por cuál de los permisos sea.
// puede_resetear_contrasenas se suma acá (no existía en la app vieja) para que
// alguien con SOLO ese permiso pueda llegar a la pestaña Usuarios.
export function tieneAccesoAdmin(profile: Profile | null): boolean {
  return isDirectorioAdmin(profile) || isDepositoAdmin(profile) || puedeVerErrores(profile) || puedeResetearContrasenas(profile) || puedeVerSugerencias(profile) || puedeGestionarDepositos(profile);
}
