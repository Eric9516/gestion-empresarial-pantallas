import { administraEquipos, esJefeDeTaller, rolDeMantenimiento, trabajaEnEquipos } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { empresa } from '~/lib/empresa';
import { datosDeMantenimiento } from '../acciones';
import MantenimientoEnNext from '../MantenimientoEnNext';

// Mantenimiento → Equipos. Con ?equipo=<id> se abre directo su ficha.
export default async function Equipos({ searchParams }: { searchParams: Promise<{ equipo?: string }> }) {
  const ctx = await contexto();
  const emp = await empresa(ctx.empresaId);
  const { equipo } = await searchParams;
  return (
    <MantenimientoEnNext pantalla="equipos" iniciales={datosIniciales(await datosDeMantenimiento())} esAdmin={administraEquipos(ctx.perfil)}
      trabaja={trabajaEnEquipos(ctx.perfil)} rol={rolDeMantenimiento(ctx.perfil)} jefe={esJefeDeTaller(ctx.perfil)} usuarioId={ctx.perfil.id} empresa={{ nombre: emp.nombre, logo: emp.logo }}
      abrir={typeof equipo === 'string' && /^[0-9a-f-]{36}$/i.test(equipo) ? equipo : null} />
  );
}
