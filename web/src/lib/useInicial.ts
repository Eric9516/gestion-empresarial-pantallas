import { useState } from 'react';
import type { Inicial } from '@/lib/usePedido';

export interface DatosIniciales<T> { data: T; lote: string }

// Los lotes que ya se mostraron en esta pestaña.
const vistos = new Set<string>();

/**
 * Los datos que vinieron con la pantalla (datosIniciales, en el servidor), listos para usePedido o usePaginas. Al volver a una pantalla
 * visitada hace poco, el navegador la muestra desde su memoria, con los datos de entonces: ese lote ya se vio, así que no es `fresco` y la
 * lista se muestra al instante y se vuelve a pedir por detrás (como hacía la app de Vite).
 */
export function useInicial<T>({ data, lote }: DatosIniciales<T>): Inicial<T> {
  const [fresco] = useState(() => {
    const nuevo = !vistos.has(lote);
    vistos.add(lote);
    return nuevo;
  });
  return { data, fresco };
}
