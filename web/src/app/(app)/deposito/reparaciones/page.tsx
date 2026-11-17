import { notFound } from 'next/navigation';
import { isDepositoAdmin } from '@/lib/types';
import { seccionesQueSeVen, usaDelDeposito } from '~/lib/comoTrabaja';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { datosDeReparaciones } from './acciones';
import ReparacionesEnNext from './ReparacionesEnNext';

// Depósito → Reparaciones: para quien administra el Depósito, si la empresa usa también Proveedores (cada reparación es con un proveedor)
// y el depósito manda cosas a reparar. Si Compras lo apagó, lo que ya había se sigue viendo y recibiendo, pero no se cargan reparaciones nuevas.
export default async function Reparaciones() {
  const ctx = await contexto();
  if (!isDepositoAdmin(ctx.perfil) || !ctx.integ.reparaciones || !(await seccionesQueSeVen(ctx)).reparaciones) notFound();
  return <ReparacionesEnNext iniciales={datosIniciales(await datosDeReparaciones())} sePuedenCrear={usaDelDeposito(ctx).reparaciones} />;
}
