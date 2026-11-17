import { leerArchivo, urlPublica } from '~/lib/archivos';

// En el servidor las miniaturas las arma Nginx y esto no se usa. En la computadora (sin Nginx) manda a la foto completa del disco.
export async function GET(_: Request, { params }: { params: Promise<{ bucket: string; ruta: string[] }> }) {
  const { bucket, ruta } = await params;
  if (bucket !== 'items' && bucket !== 'rotulos') return new Response('No existe', { status: 404 });
  const camino = ruta.map(decodeURIComponent).join('/');
  if (!(await leerArchivo(bucket, camino))) return new Response('No existe', { status: 404 });
  return new Response(null, { status: 307, headers: { Location: urlPublica(bucket, camino) } });
}
