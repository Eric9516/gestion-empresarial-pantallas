import { empresa } from '~/lib/empresa';

// La app se puede "instalar": queda con su ícono en la pantalla de inicio del celular y se abre como una aplicación más. En el iPhone hace
// falta para recibir los avisos de Mantenimiento (Safari solo los deja a las apps agregadas a la pantalla de inicio).
// El navegador lo pide sin la sesión ni las cookies: la empresa viene en la dirección (?e=…, la pone app/layout.tsx). Cada empresa instala
// la app con su nombre y su logo. La app instalada arranca con la empresa en la dirección (/?e=…): así la pantalla de entrada muestra su
// logo aunque ese celular nunca haya entrado (en el iPhone, la app instalada no comparte las cookies con Safari; ver proxy.ts).
export async function GET(pedido: Request) {
  const e = new URL(pedido.url).searchParams.get('e');
  const emp = await empresa(e);
  const conEmpresa = e && /^[0-9a-f-]{36}$/i.test(e) ? e : null;
  const icono = (t: number) => `/icono?t=${t}${conEmpresa ? `&e=${conEmpresa}` : ''}${emp.huella ? `&v=${emp.huella}` : ''}`;
  const manifiesto = {
    name: emp.nombre,
    // el nombre entero: si no entra debajo del ícono, el celular lo corta con "…"
    short_name: emp.nombre,
    description: 'Gestión de la empresa: depósito, mantenimiento y más.',
    // el "id" no cambia nunca (si cambiara, el celular la tomaría por otra app)
    id: '/',
    start_url: conEmpresa ? `/?e=${conEmpresa}` : '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1a3a6b',
    lang: 'es',
    icons: [
      { src: icono(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icono(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
      // el mismo, para los celulares que lo recortan en círculo o en otra forma (tiene el margen que piden)
      { src: icono(512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  return new Response(JSON.stringify(manifiesto), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=3600' } });
}
