import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { fetchUsuariosPorIds, nombreUsuario } from '../../lib/usuarios';

export interface HistorialItemFila {
  id: string;
  // retiro, o ajuste de inventario (suma / resta)
  tipo: 'retiro' | 'ajuste_suma' | 'ajuste_resta';
  cantidad: number;
  observacion: string | null;
  created_at: string;
  usuarioNombre: string;
  sector: string | null;
  // solo ajustes
  stockAntes: number | null;
  stockDespues: number | null;
  anulado: boolean;
  anuladoAt: string | null;
  motivoAnulacion: string | null;
}

// Historial de movimientos de un repuesto puntual (retiros y ajustes de inventario), para responder "¿quién se
// llevó esto, cuándo y de qué sector?" al hacer click en el stock del ítem.
// Usa el RPC historial_retiros_por_item en vez de una consulta directa a
// retiro_items: cualquier usuario de Mantenimiento (común o admin) puede ver
// el historial de UN ítem puntual, aunque no tenga el permiso general de "ver
// todos los retiros" que sigue restringiendo la pantalla "Mis retiros".
export function useHistorialPorItem(itemId: string | null) {
  return useQuery({
    queryKey: ['historial-por-item', itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<HistorialItemFila[]> => {
      const [retiros, ajustes] = await Promise.all([
        supabase.rpc('historial_retiros_por_item', { p_item_id: itemId as string }),
        supabase.rpc('historial_ajustes_por_item', { p_item_id: itemId as string }),
      ]);
      if (retiros.error) throw retiros.error;
      if (ajustes.error) throw ajustes.error;

      const filasRetiros = retiros.data ?? [];
      const filasAjustes = ajustes.data ?? [];
      const usuarios = await fetchUsuariosPorIds([...filasRetiros, ...filasAjustes].map(f => f.usuario_id));

      const deRetiros: HistorialItemFila[] = filasRetiros.map(f => ({
        id: f.id,
        tipo: 'retiro',
        cantidad: f.cantidad,
        observacion: f.observacion,
        created_at: f.created_at,
        usuarioNombre: nombreUsuario(usuarios[f.usuario_id], f.usuario_id),
        sector: f.sector,
        stockAntes: null, stockDespues: null, anulado: false, anuladoAt: null, motivoAnulacion: null,
      }));
      const deAjustes: HistorialItemFila[] = filasAjustes.map(f => ({
        id: f.id,
        tipo: f.tipo === 'suma' ? 'ajuste_suma' : 'ajuste_resta',
        cantidad: f.cantidad,
        observacion: f.motivo,
        created_at: f.created_at,
        usuarioNombre: nombreUsuario(usuarios[f.usuario_id], f.usuario_id),
        sector: null,
        stockAntes: f.stock_antes, stockDespues: f.stock_despues,
        anulado: f.anulado, anuladoAt: f.anulado_at, motivoAnulacion: f.motivo_anulacion,
      }));
      return [...deRetiros, ...deAjustes].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
}
