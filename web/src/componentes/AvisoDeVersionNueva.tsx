'use client';
import { useEffect, useState } from 'react';
import { Icono } from '@/components/Icono';
import { EVENTO_VERSION_NUEVA, esDeUnaVersionVieja } from '@/lib/errores';

// Cuando se publica una versión nueva con una pantalla abierta, las acciones de esa pantalla ya no existen en el servidor (Next las nombra
// distinto en cada versión). Si no hay una ventana abierta (donde se puede estar escribiendo), la pantalla se recarga sola; si la hay, se
// avisa con un botón para recargar cuando la persona quiera, así no pierde lo que escribió.
export default function AvisoDeVersionNueva() {
  const [aviso, setAviso] = useState<'recargando' | 'pedir' | null>(null);
  useEffect(() => {
    const versionNueva = () => {
      if (document.querySelector('[role="dialog"]')) { setAviso('pedir'); return; }
      setAviso('recargando');
      setTimeout(() => window.location.reload(), 1200);
    };
    const sinAtrapar = (e: PromiseRejectionEvent) => { if (esDeUnaVersionVieja(e.reason)) versionNueva(); };
    window.addEventListener(EVENTO_VERSION_NUEVA, versionNueva);
    window.addEventListener('unhandledrejection', sinAtrapar);
    return () => {
      window.removeEventListener(EVENTO_VERSION_NUEVA, versionNueva);
      window.removeEventListener('unhandledrejection', sinAtrapar);
    };
  }, []);
  if (!aviso) return null;
  return (
    <div role="status" className="aviso-version-nueva">
      <Icono n="repetir" />
      {aviso === 'recargando'
        ? <span>Se actualizó la app, recargando…</span>
        : <><span>Se actualizó la app. Recargá la página para seguir.</span>
            <button type="button" onClick={() => window.location.reload()}>Recargar</button></>}
    </div>
  );
}
