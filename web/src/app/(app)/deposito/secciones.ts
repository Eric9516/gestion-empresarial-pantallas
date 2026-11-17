import { isDepositoAdmin, puedeAjustarInventario, puedeVerInforme, tieneAccesoAdmin } from '@/lib/types';
import type { ComoTrabaja } from '~/lib/comoTrabaja';
import type { Contexto } from '~/lib/contexto';
import type { ItemDeMenu, SeccionDeMenu } from '~/componentes/menu';

export const INICIO_DEPOSITO = '/deposito';

// Las secciones del Depósito según lo que puede hacer cada uno y cómo trabaja su depósito (`seVe`: ver ~/lib/comoTrabaja).

export function seccionesDelDeposito({ perfil, modulos, integ, deposito }: Contexto, seVe: ComoTrabaja): { secciones: SeccionDeMenu[]; pie: ItemDeMenu[] } {
  const esAdmin = isDepositoAdmin(perfil);
  const si = (condicion: boolean, item: ItemDeMenu): ItemDeMenu[] => (condicion ? [item] : []);
  const secciones: SeccionDeMenu[] = ([
    { titulo: 'Día a día', items: [
      { clave: 'buscar', icono: 'buscar', titulo: 'Buscar', href: INICIO_DEPOSITO },
      // "A retirar" solo donde los operarios retiran; los retiros de antes se siguen consultando aunque Compras lo haya apagado
      ...si(deposito?.usa_retiros ?? true, { clave: 'carrito', icono: 'carrito', titulo: 'A retirar', href: '/deposito/a-retirar' }),
      ...si(seVe.retiros, { clave: 'retiros', icono: 'lista', titulo: 'Retiros', href: '/deposito/retiros' }),
    ] },
    { titulo: 'Stock', items: [
      ...si(puedeAjustarInventario(perfil), { clave: 'ajustes', icono: 'balanza', titulo: 'Movimientos', href: '/deposito/movimientos' }),
      ...si(puedeVerInforme(perfil), { clave: 'informe', icono: 'informe', titulo: 'Informe', href: '/deposito/informe' }),
      ...si(esAdmin && integ.reparaciones && seVe.reparaciones, { clave: 'reparaciones', icono: 'herramienta', titulo: 'Reparaciones', href: '/deposito/reparaciones' }),
    ] },
    { titulo: 'Gestión', items: [
      ...si(modulos.tareas, { clave: 'tareas', icono: 'exito', titulo: 'Tareas', href: '/deposito/tareas' }),
    ] },
  ] satisfies SeccionDeMenu[]).filter(s => s.items.length > 0);
  const pie: ItemDeMenu[] = tieneAccesoAdmin(perfil) ? [{ clave: 'config', icono: 'config', titulo: 'Configuración', href: '/configuracion' }] : [];
  return { secciones, pie };
}

