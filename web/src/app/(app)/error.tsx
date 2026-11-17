'use client';
import { useEffect } from 'react';
import { Icono } from '@/components/Icono';
import { botonVariantes } from '@/components/ui/botonVariantes';
import { registrarError } from '~/componentes/errores/registrar';

// Cuando una pantalla se rompe: en vez de la página en blanco de Next, un aviso y un botón para volver a cargarla. El error queda en
// Configuración → Errores (los del servidor llegan con "digest" y ya los anotó instrumentation.ts).
export default function PantallaConError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    if (!error.digest) void registrarError('Se rompió la pantalla', error);
  }, [error]);
  return (
    <main className="empty-state seccion-pendiente">
      <div className="empty-icon"><Icono n="alerta" /></div>
      <h2>Algo salió mal</h2>
      <p>No se pudo mostrar esta pantalla. El error quedó registrado; probá cargarla de nuevo.</p>
      <p><button type="button" className={botonVariantes({ variant: 'ghost' })} onClick={() => window.location.reload()}>Volver a cargar</button></p>
    </main>
  );
}
