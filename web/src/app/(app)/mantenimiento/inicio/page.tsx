import { administraEquipos, esJefeDeTaller, rolDeMantenimiento, trabajaEnEquipos } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { empresa } from '~/lib/empresa';
import { datosDeMantenimiento } from '../acciones';
import MantenimientoEnNext from '../MantenimientoEnNext';

// Mantenimiento → Inicio (del socio): la disponibilidad de los equipos en el período elegido.
export default async function Inicio() {
  const ctx = await contexto();
  const emp = await empresa(ctx.empresaId);
  return (
    <MantenimientoEnNext pantalla="inicio" iniciales={datosIniciales(await datosDeMantenimiento())} esAdmin={administraEquipos(ctx.perfil)}
      trabaja={trabajaEnEquipos(ctx.perfil)} rol={rolDeMantenimiento(ctx.perfil)} jefe={esJefeDeTaller(ctx.perfil)} usuarioId={ctx.perfil.id}
      empresa={{ nombre: emp.nombre, logo: emp.logo }} abrir={null} />
  );
}
