import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { datosDelArchivo } from '~/lib/archivos';
import { comoUsuario } from '~/lib/db';
import { exigirUsuario } from '~/lib/sesion';

// Abrir el manual de un equipo. Solo quien ve Mantenimiento: la base no le devuelve el registro a nadie más (y sin sesión, a /entrar).
// Se manda por partes: el visor de PDF del navegador pide primero lo que necesita para la página que se mira (Range) y el resto a medida que
// se lee, así un manual de 90 MB se empieza a ver enseguida. El archivo sale del disco sin cargarlo entero en memoria.
export async function GET(pedido: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await exigirUsuario();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('No existe', { status: 404 });
  const [manual] = await comoUsuario(usuario, async c =>
    (await c.query<{ nombre: string; ruta: string }>('select nombre, ruta from public.equipo_manuales where id = $1', [id])).rows);
  const datos = manual ? await datosDelArchivo('manuales', manual.ruta) : null;
  if (!manual || !datos) return new Response('No existe', { status: 404 });
  const nombre = manual.nombre.toLowerCase().endsWith('.pdf') ? manual.nombre : `${manual.nombre}.pdf`;
  const encabezados: Record<string, string> = {
    'Content-Type': 'application/pdf',
    // se abre en el navegador (con su nombre, si se descarga)
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    // es de quien lo pidió: el navegador lo puede guardar (la segunda vez abre al instante), nadie en el camino. El archivo nunca cambia.
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  };

  // una parte: "bytes=desde-hasta", "bytes=desde-" o "bytes=-últimos"
  const pedida = /^bytes=(\d*)-(\d*)$/.exec(pedido.headers.get('range') ?? '');
  if (pedida && (pedida[1] || pedida[2])) {
    const total = datos.tamanio;
    let desde = pedida[1] ? Number(pedida[1]) : Math.max(0, total - Number(pedida[2]));
    let hasta = pedida[1] && pedida[2] ? Math.min(Number(pedida[2]), total - 1) : total - 1;
    if (!pedida[1]) hasta = total - 1;
    if (desde >= total || desde > hasta) {
      return new Response(null, { status: 416, headers: { ...encabezados, 'Content-Range': `bytes */${total}` } });
    }
    desde = Math.max(0, desde);
    return new Response(Readable.toWeb(createReadStream(datos.archivo, { start: desde, end: hasta })) as ReadableStream, {
      status: 206,
      headers: { ...encabezados, 'Content-Range': `bytes ${desde}-${hasta}/${total}`, 'Content-Length': String(hasta - desde + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(datos.archivo)) as ReadableStream, {
    headers: { ...encabezados, 'Content-Length': String(datos.tamanio) },
  });
}
