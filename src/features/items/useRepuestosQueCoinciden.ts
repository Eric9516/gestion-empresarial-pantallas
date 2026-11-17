import { useEffect, useState } from 'react';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import type { RepuestoDeLista } from './tipos';

/** Cómo se buscan repuestos (cada app a su manera: Supabase en la de Vite, el servidor en la de Next). Tiene que ser siempre la misma función. */
export type BuscarRepuestos = (texto: string, limite: number) => Promise<RepuestoDeLista[]>;

// Para los selectores ("buscá un repuesto y agregalo"): los primeros resultados de lo que se va escribiendo, pedidos cuando la persona hace una pausa.
// Mientras llega una búsqueda nueva se siguen viendo los resultados anteriores.
export function useRepuestosQueCoinciden(texto: string, buscar: BuscarRepuestos, limite = 15): RepuestoDeLista[] {
  const conPausa = useDebouncedValue(texto, 200).trim();
  const [filas, setFilas] = useState<RepuestoDeLista[]>([]);
  useEffect(() => {
    if (!conPausa) return;
    let vigente = true;
    buscar(conPausa, limite).then(f => { if (vigente) setFilas(f); }).catch(() => { /* sin resultados: se sigue mostrando lo anterior */ });
    return () => { vigente = false; };
  }, [conPausa, limite, buscar]);
  return texto.trim() ? filas : [];
}
