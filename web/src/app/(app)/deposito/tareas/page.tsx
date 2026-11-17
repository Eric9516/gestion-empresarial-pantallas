import { notFound } from 'next/navigation';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';
import { misTareas, procesarPendientes } from '~/componentes/tareas/acciones';
import TareasEnNext from '~/componentes/tareas/TareasEnNext';

// Depósito → Tareas (si la empresa usa el módulo). Cada persona ve las suyas.
export default async function Tareas() {
  const { modulos } = await contexto();
  if (!modulos.tareas) notFound();
  // lo que la pantalla hacía al abrirse (procesar las pendientes y leerlas) va con ella
  await procesarPendientes();
  return <TareasEnNext iniciales={datosIniciales(await misTareas())} />;
}
