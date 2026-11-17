import { useEffect, useRef, useState } from 'react';

/** Un resultado que ya vino con la pantalla (ver `inicial` en usePedido). */
export interface Inicial<T> { data: T; fresco: boolean }

/**
 * Un dato que se pide una vez por `clave` (null = no pedir todavía) y se vuelve a pedir con `recargar`. Para las pantallas que se comparten
 * entre la app de Vite y la de Next: cada una pone cómo se pide (Supabase o el servidor), y acá solo se recuerda el último resultado.
 * Mientras llega el de una clave nueva no se muestra el de la anterior (no se mezcla un repuesto con otro), salvo con `mantenerAnterior`
 * (para listas y búsquedas: se sigue viendo el resultado anterior hasta que llega el nuevo, y `cargando` lo avisa).
 * `inicial`: lo que ya vino con la pantalla (Next lo lee en el servidor) es el resultado de la primera clave. Si es `fresco` no se vuelve a
 * pedir; si no (la pantalla volvió de la memoria del navegador), se muestra al instante y se pide de nuevo por detrás.
 */
export function usePedido<T>(clave: string | null, pedir: () => Promise<T>, mantenerAnterior = false, inicial?: Inicial<T>) {
  const [resultado, setResultado] = useState<{ clave: string; data?: T; error?: unknown } | null>(
    () => (inicial && clave !== null ? { clave, data: inicial.data } : null));
  const saltar = useRef(inicial?.fresco ?? false);
  const [vez, setVez] = useState(0);
  const pedirRef = useRef(pedir);
  useEffect(() => { pedirRef.current = pedir; });

  useEffect(() => {
    if (clave === null) return;
    if (saltar.current) { saltar.current = false; return; }
    let vigente = true;
    pedirRef.current()
      .then(data => { if (vigente) setResultado({ clave, data }); })
      .catch(error => { if (vigente) setResultado({ clave, error }); });
    return () => { vigente = false; };
  }, [clave, vez]);

  const delMismo = resultado !== null && resultado.clave === clave;
  const visible = delMismo || mantenerAnterior ? resultado : null;
  return {
    data: visible?.data,
    error: visible?.error,
    /** Hay un pedido en camino (con mantenerAnterior, lo que se ve es el resultado anterior). */
    cargando: clave !== null && !delMismo,
    recargar: () => setVez(v => v + 1),
  };
}
