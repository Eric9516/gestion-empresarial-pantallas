import { useMemo } from 'react';
import { useMantenimiento } from './servicio';

/** Los sub-equipos de un equipo, para sugerir en "Componente" (en qué parte del equipo va un repuesto). */
export function useComponentes(equipoId: string | null): string[] {
  const { equipos } = useMantenimiento();
  return useMemo(() => (equipos ?? []).filter(e => equipoId && e.padreId === equipoId).map(e => e.nombre).sort((a, b) => a.localeCompare(b, 'es')), [equipos, equipoId]);
}
