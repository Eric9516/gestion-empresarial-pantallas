import { puedeVerCalendario, rolDeMantenimiento, tieneAccesoAdmin } from '@/lib/types';
import type { Contexto } from '~/lib/contexto';
import type { ItemDeMenu, SeccionDeMenu } from '~/componentes/menu';

export const INICIO_MANTENIMIENTO = '/mantenimiento/inicio';

/** Los colores de los sectores en el menú, en su orden de importancia (así dos seguidos nunca se parecen); se leen bien en claro y en oscuro. */
const COLORES_DE_SECTOR = ['#1D9E75', '#7F77DD', '#D85A30', '#D4537E', '#378ADD', '#BA7517', '#639922', '#5F7A99'];

/** Lo que el menú sabe de las OT y los sectores (lo lee menuDeMantenimiento en ~/lib/mantenimiento). */
export interface DatosDelMenu {
  sectores: { id: string; nombre: string; padreId: string | null }[];
  pendientes: { paraMandar: number; paraRevisar: number; asignadas: number };
}

// Las secciones de Mantenimiento: inicio (la disponibilidad de los equipos), buscar equipo, calendario (con el número de OT vencidas o por
// vencer) y órdenes de trabajo (con lo que la persona tiene que hacer: derivar, asignar, revisar, aprobar o hacer; "Mis OT" para el técnico).
// El Excel está en Configuración → Mantenimiento (pedido del dueño, 12/11/2026). Debajo, los sectores (del socio, 05/11/2026), en el orden de importancia de la empresa: cada uno abre la
// lista de sus equipos, y debajo van sus sub-sectores.
export function seccionesDeMantenimiento(ctx: Contexto, avisos = 0, menu?: DatosDelMenu): { secciones: SeccionDeMenu[]; pie: ItemDeMenu[] } {
  const { perfil } = ctx;
  const tecnico = rolDeMantenimiento(perfil) === 'tecnico';
  const p = menu?.pendientes;
  const numOT = p ? p.paraMandar + p.paraRevisar + p.asignadas : 0;
  const secciones: SeccionDeMenu[] = [{ titulo: 'Mantenimiento', items: [
    { clave: 'inicio', icono: 'inicio', titulo: 'Inicio', href: INICIO_MANTENIMIENTO },
    { clave: 'equipos', icono: 'buscar', titulo: 'Buscar equipo', href: '/mantenimiento/equipos' },
    // el calendario, solo los dueños y quien tenga el permiso (pedido del dueño, 12/11/2026)
    ...(puedeVerCalendario(perfil) ? [{ clave: 'calendario', icono: 'calendario' as const, titulo: 'Calendario', href: '/mantenimiento/calendario', cantidad: avisos || undefined }] : []),
    { clave: 'ordenes', icono: 'lista', titulo: tecnico ? 'Mis OT' : 'Órdenes de trabajo', href: '/mantenimiento/ordenes', cantidad: numOT || undefined },
  ] }];
  const principales = (menu?.sectores ?? []).filter(s => !s.padreId);
  if (principales.length) {
    // cada sector es el título de su lista, con su color (pedido del dueño, 13/11/2026: con el mismo ícono para todos no se distinguía qué era
    // sector y qué sub-sector); tocarlo abre todos sus equipos, y debajo, siempre a la vista, sus sub-sectores
    secciones.push({ titulo: 'Sectores', items: principales.map((s, n) => {
      const subs = menu!.sectores.filter(x => x.padreId === s.id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      return {
        clave: `sector-${s.id}`, icono: 'fabrica' as const, titulo: s.nombre, href: `/mantenimiento/sector/${s.id}`,
        color: COLORES_DE_SECTOR[n % COLORES_DE_SECTOR.length],
        hijos: subs.map(x => ({ clave: `sector-${x.id}`, icono: 'fabrica' as const, titulo: x.nombre, href: `/mantenimiento/sector/${x.id}` })),
      };
    }) });
  }
  const pie: ItemDeMenu[] = tieneAccesoAdmin(perfil) ? [{ clave: 'config', icono: 'config', titulo: 'Configuración', href: '/configuracion?grupo=mantenimiento' }] : [];
  return { secciones, pie };
}
