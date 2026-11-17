import { redirect } from 'next/navigation';
import { contexto } from '~/lib/contexto';
import { seccionesDelDirectorio } from './secciones';

// /directorio lleva a la primera sección que usa la empresa.
export default async function Directorio() {
  const { inicio } = seccionesDelDirectorio(await contexto());
  redirect(inicio ?? '/');
}
