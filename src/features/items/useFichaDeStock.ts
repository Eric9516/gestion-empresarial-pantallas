import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabaseClient';
import { fetchUsuariosPorIds, nombreUsuario } from '../../lib/usuarios';

export type TipoDeMovimiento = 'carga' | 'ajuste' | 'retiro' | 'reparacion' | 'otro';

export interface MovimientoFila {
  id: number;
  created_at: string;
  tipo: TipoDeMovimiento;
  detalle: string;
  entrada: number;
  salida: number;
  // el stock que quedó después de este movimiento (vacío en los movimientos viejos, anteriores a llevar el saldo)
  existencia: number | null;
  comprobante: string | null;
  referencia: string | null;
  sector: string | null;
  motivo: string | null;
  usuarioNombre: string;
}

const TANDA = 50;

// La ficha de un repuesto: todo lo que entró y salió, con el saldo después de cada movimiento. Sale de una sola lista (movimientos_stock) que escribe la base cada vez que cambia
// el stock, así que nunca se desfasa. Se pide de a tandas (las más nuevas primero) y la siguiente se pide desde el último id: con millones de movimientos sigue siendo instantánea.
// (La clave 'historial-por-item' es la que ya invalidan retiros, ajustes e importaciones al cambiar el stock.)
export function useFichaDeStock(itemId: string | null) {
  return useInfiniteQuery({
    queryKey: ['historial-por-item', itemId],
    enabled: !!itemId,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<MovimientoFila[]> => {
      const { data, error } = await supabase.rpc('ficha_de_stock', { p_item_id: itemId as string, p_antes: pageParam as number, p_limite: TANDA });
      if (error) throw error;
      const filas = data ?? [];
      const usuarios = await fetchUsuariosPorIds(filas.map(f => f.usuario_id).filter((x): x is string => !!x));
      return filas.map(f => ({
        id: f.id,
        created_at: f.created_at,
        tipo: f.tipo as TipoDeMovimiento,
        detalle: f.detalle,
        entrada: Number(f.entrada),
        salida: Number(f.salida),
        existencia: f.existencia === null ? null : Number(f.existencia),
        comprobante: f.comprobante,
        referencia: f.referencia,
        sector: f.sector,
        motivo: f.motivo,
        usuarioNombre: f.usuario_id ? nombreUsuario(usuarios[f.usuario_id], f.usuario_id) : '—',
      }));
    },
    getNextPageParam: ultima => (ultima.length === TANDA ? ultima[ultima.length - 1].id : undefined),
  });
}
