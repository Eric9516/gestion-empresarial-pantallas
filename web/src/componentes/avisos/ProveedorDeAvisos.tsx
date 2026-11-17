'use client';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Avisos } from '~/lib/avisos';
import type { ItemDeMenu } from '../menu';
import { avisosDelMenu, marcarAvisoVisto } from './acciones';

// Los avisos del menú de un área, para el menú de la computadora y el del celular a la vez (uno solo pide, los dos muestran).
// Llegan con la pantalla y se vuelven a pedir cada 30 segundos y al volver a la ventana, como en la app de siempre.
const CADA_CUANTO = 30_000;
const SIN_AVISOS: Avisos = { retiros: 0, sugerencias: 0 };
const Contexto = createContext<Avisos>(SIN_AVISOS);

export function ProveedorDeAvisos({ iniciales, children }: { iniciales: Avisos; children: ReactNode }) {
  const [avisos, setAvisos] = useState(iniciales);
  const ruta = usePathname();
  const enRetiros = ruta.startsWith('/deposito/retiros');

  useEffect(() => {
    // es un adorno del menú: si falla, se deja como estaba
    const pedir = () => { if (document.visibilityState === 'visible') avisosDelMenu().then(setAvisos, () => {}); };
    const reloj = setInterval(pedir, CADA_CUANTO);
    document.addEventListener('visibilitychange', pedir);
    return () => { clearInterval(reloj); document.removeEventListener('visibilitychange', pedir); };
  }, []);

  // con los retiros abiertos, los nuevos ya se están viendo: no se muestran y se marcan como vistos (también para los otros equipos)
  useEffect(() => {
    if (!enRetiros || !avisos.retiros) return;
    marcarAvisoVisto('retiros').then(avisosDelMenu).then(setAvisos, () => {});
  }, [enRetiros, avisos.retiros]);

  return <Contexto.Provider value={enRetiros ? { ...avisos, retiros: 0 } : avisos}>{children}</Contexto.Provider>;
}

/** Para ponerles a las secciones del menú su número de avisos (Retiros, y Configuración por las sugerencias). */
// oxlint-disable-next-line react/only-export-components -- el hook que lee este contexto va junto a su proveedor a propósito
export function useConAvisos(): (items: ItemDeMenu[]) => ItemDeMenu[] {
  const avisos = useContext(Contexto);
  const cantidad = (clave: string) => (clave === 'retiros' ? avisos.retiros : clave === 'config' ? avisos.sugerencias : 0);
  return items => items.map(i => (i.cantidad === undefined && cantidad(i.clave) ? { ...i, cantidad: cantidad(i.clave) } : i));
}
