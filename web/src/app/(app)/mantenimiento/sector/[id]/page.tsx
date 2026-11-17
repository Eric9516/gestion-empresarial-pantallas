import { notFound } from 'next/navigation';
import { administraEquipos, esJefeDeTaller, rolDeMantenimiento, trabajaEnEquipos } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { empresa } from '~/lib/empresa';
import { datosDeMantenimiento } from '../../acciones';
import MantenimientoEnNext from '../../MantenimientoEnNext';

// Mantenimiento → un sector (o sub-sector) del menú (del socio, 05/11/2026): la lista de sus equipos. Con ?equipo=<id> se abre directo uno.
export default async function Sector({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ equipo?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await contexto();
  const emp = await empresa(ctx.empresaId);
  const { equipo } = await searchParams;
  return (
    <MantenimientoEnNext pantalla="equipos" sector={id} iniciales={datosIniciales(await datosDeMantenimiento())} esAdmin={administraEquipos(ctx.perfil)}
      trabaja={trabajaEnEquipos(ctx.perfil)} rol={rolDeMantenimiento(ctx.perfil)} jefe={esJefeDeTaller(ctx.perfil)} usuarioId={ctx.perfil.id}
      empresa={{ nombre: emp.nombre, logo: emp.logo }} abrir={typeof equipo === 'string' && /^[0-9a-f-]{36}$/i.test(equipo) ? equipo : null} />
  );
}
