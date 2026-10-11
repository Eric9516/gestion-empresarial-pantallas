import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Item } from './useItems';
import { analizarNumeros, type AnalisisDeNumeros } from '../../lib/numeracion';

// Todos los repuestos de UNA subfamilia, también los desactivados (su número sigue ocupado en la base),
// para sugerir el próximo número y avisar de los que están cargados sin descripción.
// La clave empieza con 'items': cuando se guarda un repuesto, esta consulta se refresca sola.
export function useRepuestosDeSubfamilia(familiaId: string, subfamiliaId: string) {
  return useQuery({
    queryKey: ['items', 'subfamilia', familiaId, subfamiliaId],
    enabled: !!familiaId && !!subfamiliaId,
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('*, familias(id,codigo,nombre), subfamilias(id,codigo,nombre)')
        .eq('familia_id', familiaId)
        .eq('subfamilia_id', subfamiliaId)
        .limit(5000);
      if (error) throw error;
      return data as Item[];
    },
    select: (items): { items: Item[]; analisis: AnalisisDeNumeros } => ({ items, analisis: analizarNumeros(items) }),
  });
}
