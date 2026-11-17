import { notFound } from 'next/navigation';
import { misTareas, procesarPendientes } from '~/componentes/tareas/acciones';
import TareasEnNext from '~/componentes/tareas/TareasEnNext';
import { contexto } from '~/lib/contexto';
import { datosIniciales } from '~/lib/datosIniciales';

// Directorio → Tareas: la misma pantalla que en el Depósito (cada persona ve las suyas).
export default async function Tareas() {
  if (!(await contexto()).modulos.tareas) notFound();
  // lo que la pantalla hacía al abrirse (procesar las pendientes y leerlas) va con ella
  await procesarPendientes();
  return <TareasEnNext iniciales={datosIniciales(await misTareas())} />;
}
