import { notFound } from 'next/navigation';
import { isDirectorioAdmin } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { listaDeComisionistas } from '../acciones';
import ComisionistasEnNext from './ComisionistasEnNext';

// Directorio → Comisionistas (si la empresa usa el módulo). Crear, editar y eliminar: quien administra el Directorio.
export default async function Comisionistas() {
  const { perfil, modulos } = await contexto();
  if (!modulos.comisionistas) notFound();
  return <ComisionistasEnNext admin={isDirectorioAdmin(perfil)} iniciales={datosIniciales(await listaDeComisionistas())} />;
}
