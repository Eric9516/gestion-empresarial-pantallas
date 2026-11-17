import { notFound } from 'next/navigation';
import { isDirectorioAdmin } from '@/lib/types';
import { datosParaEnvios, listaDeEnvios } from '~/componentes/envios/acciones';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import EnviosEnNext from './EnviosEnNext';

// Directorio → Envíos (si la empresa usa el módulo). Editar, eliminar y comentar: quien administra el Directorio.
export default async function Envios() {
  const { perfil, modulos } = await contexto();
  if (!modulos.envios) notFound();
  const [lista, paraEnvios] = await Promise.all([listaDeEnvios(), datosParaEnvios()]);
  return <EnviosEnNext admin={isDirectorioAdmin(perfil)} iniciales={datosIniciales({ lista, paraEnvios })} />;
}
