import { tieneAccesoAdmin } from '@/lib/types';
import type { Contexto } from '~/lib/contexto';
import type { ItemDeMenu, SeccionDeMenu } from '~/componentes/menu';

// Las secciones del Directorio según los módulos que usa la empresa: las mismas que DirectorioPage en la app de Vite.
export function seccionesDelDirectorio({ perfil, modulos }: Contexto): { secciones: SeccionDeMenu[]; pie: ItemDeMenu[]; inicio: string | null } {
  const si = (condicion: boolean, item: ItemDeMenu): ItemDeMenu[] => (condicion ? [item] : []);
  const directorio: ItemDeMenu[] = [
    ...si(modulos.proveedores, { clave: 'proveedores', icono: 'fabrica', titulo: 'Proveedores', href: '/directorio/proveedores' }),
    ...si(modulos.comisionistas, { clave: 'comisionistas', icono: 'acuerdo', titulo: 'Comisionistas', href: '/directorio/comisionistas' }),
    ...si(modulos.envios, { clave: 'envios', icono: 'paquete', titulo: 'Envíos', href: '/directorio/envios' }),
  ];
  const gestion = si(modulos.tareas, { clave: 'tareas', icono: 'exito', titulo: 'Tareas', href: '/directorio/tareas' });
  const secciones = [{ titulo: 'Directorio', items: directorio }, { titulo: 'Gestión', items: gestion }].filter(s => s.items.length > 0);
  const pie: ItemDeMenu[] = tieneAccesoAdmin(perfil) ? [{ clave: 'config', icono: 'config', titulo: 'Configuración', href: '/configuracion' }] : [];
  return { secciones, pie, inicio: [...directorio, ...gestion][0]?.href ?? null };
}
