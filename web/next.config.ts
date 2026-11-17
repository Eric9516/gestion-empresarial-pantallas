import { join } from 'node:path';
import type { NextConfig } from 'next';

// La raíz es la del repositorio: así las pantallas nuevas usan los mismos estilos (y, a medida que se pasen, los mismos componentes)
// que la app de Vite en src/, sin copiarlos.
const RAIZ = join(import.meta.dirname, '..');

const config: NextConfig = {
  // Solo lo necesario para correr: es lo que va adentro de la caja de la app (Dockerfile).
  output: 'standalone',
  outputFileTracingRoot: RAIZ,
  // El almacén de paquetes de la app de Vite (node_modules/.pnpm de la raíz) no viaja: lo que se carga al correr (react, pg) sale de web/node_modules,
  // y copiarlo en Windows falla de a ratos (pnpm lo arma con accesos directos).
  outputFileTracingExcludes: { '*': ['../node_modules/.pnpm/**'] },
  turbopack: { root: RAIZ },
  poweredByHeader: false,
  // La versión publicada (la pone el armado de la caja: web/Dockerfile). Si al navegar el navegador tiene otra, Next recarga la pantalla entera
  // en vez de mezclar las dos versiones.
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || undefined,
  experimental: {
    // las fotos viajan ya achicadas (~200 KB), pero una sin achicar puede llegar a varios MB
    serverActions: { bodySizeLimit: '6mb' },
    // Volver a una pantalla visitada en los últimos 30 segundos la muestra al instante desde la memoria del navegador (como la app de
    // Vite); las listas que vienen con la pantalla se vuelven a pedir por detrás (~/lib/useInicial) y lo que se guarda la refresca
    // (revalidatePath). Pasados los 30 segundos, se pide de nuevo al servidor.
    staleTimes: { dynamic: 30 },
  },
  // Las direcciones de la app de siempre siguen sirviendo (los accesos guardados en el celular o en favoritos, el día del pase). /mantenimiento
  // llevaba al Depósito (allí vivía antes) con un desvío permanente, que los navegadores recuerdan: por eso el área de Mantenimiento
  // vive en /mantenimiento/equipos, /mantenimiento/…, y /mantenimiento a secas lleva ahí.
  async redirects() {
    return [
      { source: '/login', destination: '/entrar', permanent: true },
      { source: '/admin', destination: '/configuracion', permanent: true },
    ];
  },
  async headers() {
    return [{
      source: '/:camino*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        // la cámara solo la usa la app (lector de QR); micrófono, ubicación y pagos, nadie
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
        // otra página abierta desde la app (o que la abra) no puede tocar esta ventana
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default config;
