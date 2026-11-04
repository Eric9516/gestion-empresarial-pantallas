import { supabase } from '../../lib/supabaseClient';

// Lee el stock actual de los repuestos del Depósito (tabla items, que ya existe) por su código.
// El catálogo vive en el servidor y nunca se descarga entero: se piden solo los códigos que usa Mantenimiento.

export interface StockDeposito { id: string; codigo: string; descripcion: string; stock: number | null; ubicacion: string | null }

export async function leerStockPorCodigos(codigos: string[]): Promise<StockDeposito[]> {
  const filas: StockDeposito[] = [];
  for (let i = 0; i < codigos.length; i += 100) {
    const { data, error } = await supabase.from('items').select('id, codigo, descripcion, stock, ubicacion').in('codigo', codigos.slice(i, i + 100)).eq('activo', true);
    if (error) throw error;
    for (const f of data ?? []) filas.push({ ...f, stock: f.stock === null ? null : Number(f.stock) });
  }
  return filas;
}
