import { administraEquipos, esJefeDeTaller, rolDeMantenimiento, trabajaEnEquipos } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { empresa } from '~/lib/empresa';
import { datosDeMantenimiento } from '../acciones';
import { datosDePreventivo } from '../accionesPreventivo';
import MantenimientoEnNext from '../MantenimientoEnNext';

// Mantenimiento → Órdenes de trabajo (un técnico arranca viendo las suyas). Con ?ot=<id> se abre directo esa OT.
export default async function Ordenes({ searchParams }: { searchParams: Promise<{ ot?: string }> }) {
  const ctx = await contexto();
  const emp = await empresa(ctx.empresaId);
  const { ot } = await searchParams;
  return (
    <MantenimientoEnNext pantalla="ordenes" iniciales={datosIniciales(await datosDeMantenimiento())} preventivo={datosIniciales(await datosDePreventivo())}
      esAdmin={administraEquipos(ctx.perfil)} trabaja={trabajaEnEquipos(ctx.perfil)} rol={rolDeMantenimiento(ctx.perfil)} jefe={esJefeDeTaller(ctx.perfil)} usuarioId={ctx.perfil.id}
      empresa={{ nombre: emp.nombre, logo: emp.logo }} abrir={typeof ot === 'string' && /^[0-9a-f-]{36}$/i.test(ot) ? ot : null} />
  );
}
