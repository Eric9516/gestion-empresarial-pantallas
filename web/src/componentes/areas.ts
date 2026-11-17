import { iconoDeDeposito, NOMBRE_DEPOSITO_POR_DEFECTO } from '@/features/depositos/iconos';
import { hayModulosDeDirectorio } from '@/lib/modulos';
import { administraEquipos, isDepositoAdmin, isDirectorioAdmin, isDirectorioDesactivado, isOwner, puedeVerEquipos, tieneAccesoDeposito } from '@/lib/types';
import { seccionesDelDirectorio } from '~/app/(app)/directorio/secciones';
import type { Contexto } from '~/lib/contexto';
import type { DatosDeUsuario } from './MenuDeUsuario';
import type { ItemDeMenu, SeccionDeMenu } from './menu';

// Las áreas de la app (Directorio, Depósito y Mantenimiento) y quién puede ir a cada una.

export const puedeIrAlDirectorio = ({ perfil, modulos }: Contexto) => !isDirectorioDesactivado(perfil) && hayModulosDeDirectorio(modulos);
// (antes también iba quien no tenía Directorio, porque la base exigía que tuviera el Depósito; ahora puede tener solo Mantenimiento)
export const puedeIrAlDeposito = ({ perfil, modulos }: Contexto) => modulos.deposito && tieneAccesoDeposito(perfil);
/** Mantenimiento (los equipos): con el módulo prendido, quien tenga un rol de Mantenimiento o sea dueño. */
export const puedeIrAMantenimiento = ({ perfil, modulos }: Contexto) => modulos.mantenimiento && puedeVerEquipos(perfil);

export type Area = 'directorio' | 'deposito' | 'mantenimiento';

/** El grupo "Áreas" del menú, solo si la persona puede ir a más de una (si tiene una sola, no hace falta mostrarlo). */
export function seccionDeAreas(ctx: Contexto, actual: Area): SeccionDeMenu[] {
  const items: ItemDeMenu[] = [
    ...(puedeIrAlDirectorio(ctx) ? [{ clave: 'area-directorio', icono: 'directorio' as const, titulo: 'Directorio',
      // directo a su primera sección (/directorio redirige ahí, pero sería un viaje más al servidor)
      href: seccionesDelDirectorio(ctx).inicio ?? '/directorio', activo: actual === 'directorio' }] : []),
    // una sola línea: "Depósitos" si tiene varios (cuál, se elige arriba de la pantalla) o el nombre del único que tiene
    ...(puedeIrAlDeposito(ctx) ? [{ clave: 'area-deposito', icono: iconoDeDeposito(ctx.depositos.length > 1 ? null : ctx.deposito?.icono),
      titulo: ctx.depositos.length > 1 ? 'Depósitos' : ctx.deposito?.nombre ?? NOMBRE_DEPOSITO_POR_DEFECTO,
      href: '/deposito', activo: actual === 'deposito' }] : []),
    ...(puedeIrAMantenimiento(ctx) ? [{ clave: 'area-mantenimiento', icono: 'mantenimiento' as const, titulo: 'Mantenimiento', href: '/mantenimiento/inicio',
      activo: actual === 'mantenimiento' }] : []),
  ];
  return items.length > 1 ? [{ titulo: 'Áreas', items }] : [];
}

/** Cómo se muestra la persona en la cabecera y los menús. */
export function datosDeUsuario({ perfil, modulos, deposito, esPlataforma, cuentaDePlataforma }: Contexto): DatosDeUsuario {
  const rol = cuentaDePlataforma ? 'Plataforma' : isOwner(perfil) ? 'Dueño' : isDirectorioAdmin(perfil) || isDepositoAdmin(perfil) || administraEquipos(perfil) ? 'Admin' : 'Usuario';
  return {
    nombre: perfil.nombre || perfil.email?.split('@')[0] || 'Usuario', apellido: perfil.apellido ?? '', email: perfil.email ?? '', rol,
    perfil, conDeposito: modulos.deposito, conMantenimiento: modulos.mantenimiento, nombreDeposito: deposito?.nombre ?? NOMBRE_DEPOSITO_POR_DEFECTO, esPlataforma, cuentaDePlataforma,
  };
}
