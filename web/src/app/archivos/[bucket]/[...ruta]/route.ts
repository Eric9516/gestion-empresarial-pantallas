import { BUCKETS_PUBLICOS, leerArchivo } from '~/lib/archivos';

const TIPOS: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' };

// Los archivos públicos (fotos de repuestos). En el servidor los sirve Nginx directo y esto no se usa; queda para la computadora y por si acaso.
// Los nombres llevan la hora de subida, así que nunca cambian: el navegador los guarda un año.
export async function GET(_: Request, { params }: { params: Promise<{ bucket: string; ruta: string[] }> }) {
  const { bucket, ruta } = await params;
  if (!BUCKETS_PUBLICOS.has(bucket)) return new Response('No existe', { status: 404 });
  const camino = ruta.map(decodeURIComponent).join('/');
  const contenido = await leerArchivo(bucket, camino);
  if (!contenido) return new Response('No existe', { status: 404 });
  return new Response(new Uint8Array(contenido), {
    headers: {
      'Content-Type': TIPOS[camino.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
