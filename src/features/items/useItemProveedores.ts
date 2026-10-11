import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import type { Proveedor } from '../proveedores/useProveedores';

export type ProveedorDeItem = {
  id: string; // id del vínculo (item_proveedores.id)
  proveedor: Pick<Proveedor, 'id' | 'nombre' | 'rubro'>;
};

const queryKey = (itemId: string | undefined) => ['item_proveedores', itemId] as const;

// Los proveedores en la Papelera (eliminado = true) no se listan: el vínculo
// queda guardado y reaparece solo cuando se restaura el proveedor.
export function useProveedoresDeItemQuery(itemId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKey(itemId),
    enabled: enabled && !!itemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_proveedores')
        .select('id, proveedores!inner(id, nombre, rubro, eliminado)')
        .eq('item_id', itemId!)
        .eq('proveedores.eliminado', false);
      if (error) throw error;
      return (data ?? [])
        .map(r => ({ id: r.id, proveedor: r.proveedores }))
        .sort((a, b) => a.proveedor.nombre.localeCompare(b.proveedor.nombre)) as ProveedorDeItem[];
    },
  });
}

export function useAgregarProveedorAItem(itemId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (proveedorId: string) => {
      const { error } = await supabase.from('item_proveedores').insert({ item_id: itemId!, proveedor_id: proveedorId });
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKey(itemId) }); },
  });
}

export function useQuitarProveedorDeItem(itemId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vinculoId: string) => {
      const { error } = await supabase.from('item_proveedores').delete().eq('id', vinculoId);
      if (error) throw error;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKey(itemId) }); },
  });
}
