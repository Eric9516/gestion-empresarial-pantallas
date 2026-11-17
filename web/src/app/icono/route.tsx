import { ImageResponse } from 'next/og';
import { empresa, logoEnBase64 } from '~/lib/empresa';

// El ícono de la app (al instalarla en el celular, en el iPhone y en los avisos): el logo de la empresa (Configuración → Empresa) sobre
// blanco, con margen para que entre entero aunque el celular lo recorte en círculo; sin logo, la inicial de la empresa sobre su color.
// ?t= el tamaño (96, 180, 192 o 512). ?e= la empresa (el navegador lo pide sin cookies). ?v= la huella del logo (cambia con el logo).
// El de 96 es el chiquito de la barra de arriba de Android en los avisos: el sistema lo pinta de un solo color (solo cuenta la forma), así
// que ahí va siempre la inicial, que se distingue; un logo quedaría como una mancha.
const LOGO_QUE_SE_PUEDE_DIBUJAR = /^data:image\/(?:png|jpe?g|gif|svg\+xml);base64,/;

export async function GET(pedido: Request) {
  const dir = new URL(pedido.url).searchParams;
  const pedidoT = Number(dir.get('t'));
  const t = [96, 180, 192, 512].includes(pedidoT) ? pedidoT : 192;
  const e = await empresa(dir.get('e'));
  const logo = t > 96 ? await logoEnBase64(dir.get('e')) : null;
  const caja = Math.round(t * 0.62);
  const color = /^#[0-9a-f]{6}$/i.test(e.colorPrimario ?? '') ? e.colorPrimario! : '#1a3a6b';
  const inicial = (e.nombre.trim()[0] ?? 'G').toUpperCase();
  const conLogo = logo && LOGO_QUE_SE_PUEDE_DIBUJAR.test(logo);
  const imagen = new ImageResponse(
    conLogo ? (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- es la imagen que arma el ícono, no una pantalla */}
        <img src={logo} alt="" width={caja} height={caja} style={{ objectFit: 'contain' }} />
      </div>
    ) : (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: color, color: '#fff',
        fontSize: Math.round(t * 0.58), fontWeight: 700 }}>
        {inicial}
      </div>
    ),
    { width: t, height: t },
  );
  // con la huella del logo en la dirección, no cambia nunca; sin ella, se revisa cada día
  imagen.headers.set('Cache-Control', dir.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
  return imagen;
}
