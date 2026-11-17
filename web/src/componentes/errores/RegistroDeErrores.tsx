'use client';
import { useEffect } from 'react';
import { registrarErrorSinAtrapar } from './registrar';

// Los errores que nadie atrapó en el navegador van a Configuración → Errores (los que rompen una pantalla los anota su error.tsx).
// "Script error." es de un archivo de otro sitio (una extensión del navegador) y el de ResizeObserver es un aviso sin consecuencias.
const SIN_IMPORTANCIA = /^Script error\.?$|ResizeObserver loop/;

export default function RegistroDeErrores() {
  useEffect(() => {
    const alFallar = (e: ErrorEvent) => {
      if (!e.message || SIN_IMPORTANCIA.test(e.message)) return;
      void registrarErrorSinAtrapar(e.error ?? e.message);
    };
    const alRechazar = (e: PromiseRejectionEvent) => { void registrarErrorSinAtrapar(e.reason); };
    window.addEventListener('error', alFallar);
    window.addEventListener('unhandledrejection', alRechazar);
    return () => {
      window.removeEventListener('error', alFallar);
      window.removeEventListener('unhandledrejection', alRechazar);
    };
  }, []);
  return null;
}
