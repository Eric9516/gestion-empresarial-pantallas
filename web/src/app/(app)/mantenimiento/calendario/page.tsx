import { redirect } from 'next/navigation';
import { administraEquipos, esJefeDeTaller, puedeVerCalendario, rolDeMantenimiento, trabajaEnEquipos } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { empresa } from '~/lib/empresa';
import { datosDeMantenimiento } from '../acciones';
import { datosDePreventivo } from '../accionesPreventivo';
import MantenimientoEnNext from '../MantenimientoEnNext';
import { INICIO_MANTENIMIENTO } from '../secciones';

// Mantenimiento → Calendario: avisos, el mes con las OT de cada día y las rutinas preventivas.
export default async function Calendario() {
  const ctx = await contexto();
  // solo los dueños y quien tenga el permiso; los demás, al inicio de Mantenimiento
  if (!puedeVerCalendario(ctx.perfil)) redirect(INICIO_MANTENIMIENTO);
  const emp = await empresa(ctx.empresaId);
  return (
    <MantenimientoEnNext pantalla="calendario" iniciales={datosIniciales(await datosDeMantenimiento())} preventivo={datosIniciales(await datosDePreventivo())}
      esAdmin={administraEquipos(ctx.perfil)} trabaja={trabajaEnEquipos(ctx.perfil)} rol={rolDeMantenimiento(ctx.perfil)} jefe={esJefeDeTaller(ctx.perfil)} usuarioId={ctx.perfil.id}
      empresa={{ nombre: emp.nombre, logo: emp.logo }} abrir={null} />
  );
}
