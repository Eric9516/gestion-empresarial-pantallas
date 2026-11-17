import type { NombreIcono } from '@/components/Icono';

// Lo que el servidor le pasa al menú (solo datos: el menú es del navegador). `href` es a dónde lleva cada sección.
export interface ItemDeMenu {
  clave: string;
  icono: NombreIcono;
  titulo: string;
  href: string;
  cantidad?: number;
  /** Para marcarlo como el actual siempre (por ejemplo, el área en la que se está), en vez de por la dirección. */
  activo?: boolean;
  /**
   * El ítem es el título de una lista (los sectores de Mantenimiento, pedido del dueño, 13/11/2026): en el menú lateral y en el del celular
   * va con una barrita de este color en vez del ícono (con el menú cerrado, la inicial sobre ese color).
   */
  color?: string;
  /**
   * Los ítems de la lista (los sub-sectores). En el menú lateral y en el del celular arrancan plegados (pedido del dueño, 13/11/2026): tocar
   * el título los despliega o los pliega (de a uno por vez) y "ver todos" lleva a `href`. En la barra de arriba o de abajo no se muestran.
   */
  hijos?: ItemDeMenu[];
}

/** El ítem con sub-menú que tiene adentro la página actual (para que arranque desplegado). */
export function desplegadoAl(items: ItemDeMenu[], ruta: string, inicioDelArea: string): string | null {
  return items.find(i => i.hijos?.some(h => estaActiva(h, ruta, inicioDelArea)))?.clave ?? null;
}

export interface SeccionDeMenu {
  titulo: string;
  items: ItemDeMenu[];
}

/** Activa si es la página de la sección o una de adentro (la de inicio del área solo cuando es exactamente esa). */
export function estaActiva(item: { href: string; activo?: boolean }, ruta: string, inicioDelArea: string): boolean {
  if (item.activo !== undefined) return item.activo;
  return item.href === inicioDelArea ? ruta === item.href : ruta === item.href || ruta.startsWith(item.href + '/');
}
