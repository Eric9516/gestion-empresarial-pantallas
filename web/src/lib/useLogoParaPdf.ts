import { useEffect, useState } from 'react';

/**
 * El logo como lo necesitan los PDF (data:image/…;base64,…), leído de /logo?v=… después de abrir la pantalla: así no viaja metido en
 * cada pantalla (pesa ~150 KB) y el navegador lo tiene guardado de la cabecera. Mientras llega (o sin logo) es ''.
 */
export function useLogoParaPdf(direccion: string | null): string {
  const [logo, setLogo] = useState('');
  useEffect(() => {
    if (!direccion) return;
    let vigente = true;
    fetch(direccion)
      .then(r => (r.ok ? r.blob() : null))
      .then(b => b && new Promise<string>((listo, fallo) => {
        const lector = new FileReader();
        lector.onload = () => listo(String(lector.result));
        lector.onerror = () => fallo(lector.error);
        lector.readAsDataURL(b);
      }))
      .then(datos => { if (vigente && datos) setLogo(datos); })
      .catch(() => { /* sin logo, el PDF sale igual */ });
    return () => { vigente = false; };
  }, [direccion]);
  return logo;
}
