import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import AvisoDeVersionNueva from '~/componentes/AvisoDeVersionNueva';
import { empresa, empresaDelPedido } from '~/lib/empresa';
// Las mismas letras y los mismos estilos que la app de Vite (src/styles), sin copiarlos: las pantallas se ven igual.
import '@fontsource-variable/nunito/wght.css';
import '@fontsource/playfair-display/latin-700.css';
import '../../../src/styles/index.css';
import './estilos.css';

// Todas las pantallas dependen de la base (nombre de la empresa, sesión): se arman al pedirlas, nunca al construir la app.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { nombre, huella } = await empresa();
  // la app instalable (app/manifest.webmanifest) y el ícono del iPhone: el navegador los pide sin cookies, así que van con la empresa en la
  // dirección (la de la sesión abierta o, en la pantalla de entrada, la de la cookie)
  const id = await empresaDelPedido();
  const e = id ? `e=${id}` : '';
  return {
    title: nombre, manifest: `/manifest.webmanifest${e ? `?${e}` : ''}`, icons: { apple: `/icono?t=180${e ? `&${e}` : ''}${huella ? `&v=${huella}` : ''}` },
    appleWebApp: { capable: true, title: nombre, statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1a3a6b' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}<AvisoDeVersionNueva /></body>
    </html>
  );
}
