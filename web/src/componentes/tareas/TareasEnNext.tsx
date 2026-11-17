'use client';
import { useMemo, useRef, useState } from 'react';
import PantallaDeTareas from '@/features/tareas/PantallaDeTareas';
import { ContextoDeTareas, type ServicioDeTareas } from '@/features/tareas/servicioDeTareas';
import type { Tarea } from '@/features/tareas/tipos';
import { usePedido } from '@/lib/usePedido';
import { type DatosIniciales, useInicial } from '~/lib/useInicial';
import { cancelarTarea, completarTarea, crearTarea, editarTarea, historialDeTarea, misTareas, procesarPendientes, reprogramarTarea } from './acciones';

// La misma pantalla de la app de Vite, con las tareas y las acciones del servidor propio. Después de cada cambio se vuelven a leer.
export default function TareasEnNext({ iniciales }: { iniciales: DatosIniciales<Tarea[]> }) {
  const [revision, setRevision] = useState(0);
  const inicial = useInicial(iniciales);
  const lista = usePedido(`tareas|${revision}`, misTareas, true, inicial);
  // las pendientes ya se procesaron en el servidor al armar la pantalla: la primera vez que la pantalla lo pide, no hace falta
  const yaProcesadas = useRef(inicial.fresco);

  const servicio = useMemo<ServicioDeTareas>(() => {
    const yLeer = async (r: Promise<{ error: string | null }>) => {
      const { error } = await r;
      if (error) throw new Error(error);
      setRevision(v => v + 1);
    };
    return {
      tareas: lista.data,
      isLoading: lista.data === undefined && !lista.error,
      isError: !!lista.error,
      revision,
      procesarPendientes: () => {
        if (yaProcesadas.current) { yaProcesadas.current = false; return Promise.resolve(); }
        return yLeer(procesarPendientes());
      },
      historial: historialDeTarea,
      crear: t => yLeer(crearTarea(t)),
      editar: t => yLeer(editarTarea(t)),
      completar: id => yLeer(completarTarea(id)),
      cancelar: id => yLeer(cancelarTarea(id)),
      reprogramar: (id, fecha) => yLeer(reprogramarTarea(id, fecha)),
    };
  }, [lista.data, lista.error, revision]);

  return <ContextoDeTareas.Provider value={servicio}><PantallaDeTareas /></ContextoDeTareas.Provider>;
}
