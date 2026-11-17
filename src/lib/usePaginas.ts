import { useEffect, useRef, useState } from 'react';

interface ConCursor { created_at: string; id: string }
export type Cursor = ConCursor;

/**
 * Una lista que se pide al servidor de a páginas (las más nuevas primero; la siguiente, desde la última fila de la anterior).
 * `clave` resume la búsqueda: cuando cambia se vuelve a la primera página; mientras llega, se sigue viendo la anterior (no parpadea).
 * Devuelve lo mismo que las pantallas compartidas esperan (isLoading, hayMas, verMas…). La usan las dos apps.
 * `inicial`: la primera página, si ya vino con la pantalla (como en usePedido: si no es fresca, se muestra y se vuelve a pedir).
 */
export function usePaginas<T extends ConCursor>(clave: string, pedir: (despuesDe: Cursor | null) => Promise<T[]>, porPagina = 50,
  inicial?: { data: T[]; fresco: boolean }) {
  const [paginas, setPaginas] = useState<{ clave: string; filas: T[]; hayMas: boolean } | null>(
    () => (inicial ? { clave, filas: inicial.data, hayMas: inicial.data.length === porPagina } : null));
  const saltar = useRef(inicial?.fresco ?? false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState(false);
  // siempre la última forma de pedir (la de la búsqueda de ahora), sin volver a pedir por cada dibujo
  const pedirRef = useRef(pedir);
  useEffect(() => { pedirRef.current = pedir; });

  useEffect(() => {
    if (saltar.current) { saltar.current = false; return; }
    let vigente = true;
    pedirRef.current(null)
      .then(filas => { if (vigente) { setPaginas({ clave, filas, hayMas: filas.length === porPagina }); setError(false); } })
      .catch(() => { if (vigente) setError(true); });
    return () => { vigente = false; };
  }, [clave, porPagina]);

  async function verMas() {
    const ultima = paginas?.filas[paginas.filas.length - 1];
    if (!ultima || cargandoMas) return;
    setCargandoMas(true);
    try {
      const mas = await pedirRef.current({ created_at: ultima.created_at, id: ultima.id });
      setPaginas(p => p && { ...p, filas: [...p.filas, ...mas], hayMas: mas.length === porPagina });
    } catch { setError(true); } finally { setCargandoMas(false); }
  }

  const listas = paginas !== null;
  return {
    filas: paginas?.filas ?? [],
    isLoading: !listas && !error,
    isError: error,
    hayMas: !!paginas?.hayMas,
    cargandoMas,
    verMas: () => void verMas(),
    buscando: listas && paginas.clave !== clave,
  };
}
