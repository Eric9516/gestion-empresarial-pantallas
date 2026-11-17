import { logoEnBase64 } from '~/lib/empresa';

// El logo de la empresa como imagen (?e=… dice de cuál). Con la huella (?v=…, la pone empresa()) no cambia nunca: el navegador lo guarda un año.
export async function GET(pedido: Request) {
  const logo = await logoEnBase64(new URL(pedido.url).searchParams.get('e'));
  const partes = logo?.match(/^data:(image\/(?:png|jpe?g|webp|gif|svg\+xml));base64,(.+)$/);
  if (!partes) return new Response('No hay logo', { status: 404 });
  const conHuella = new URL(pedido.url).searchParams.has('v');
  return new Response(new Uint8Array(Buffer.from(partes[2], 'base64')), {
    headers: {
      'Content-Type': partes[1],
      'Cache-Control': conHuella ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      // un SVG abierto directo no puede correr nada
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
