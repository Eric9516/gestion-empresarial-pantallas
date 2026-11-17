import { notFound } from 'next/navigation';
import { isDirectorioAdmin } from '@/lib/types';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { listaDeProveedores } from '../acciones';
import ProveedoresEnNext from './ProveedoresEnNext';

// Directorio → Proveedores (si la empresa usa el módulo). Crear, editar y eliminar: quien administra el Directorio.
export default async function Proveedores() {
  const { perfil, modulos } = await contexto();
  if (!modulos.proveedores) notFound();
  return <ProveedoresEnNext admin={isDirectorioAdmin(perfil)} conEnvios={modulos.envios} iniciales={datosIniciales(await listaDeProveedores())} />;
}
