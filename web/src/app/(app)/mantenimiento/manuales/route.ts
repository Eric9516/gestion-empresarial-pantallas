import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { borrarArchivo, datosDelArchivo, guardarDesdeFlujo } from '~/lib/archivos';
import { contexto } from '~/lib/contexto';
import { comoUsuario } from '~/lib/db';
import { Id, Texto, entrada } from '~/lib/entrada';
import { optimizarParaVerPorPartes } from '~/lib/pdf';
import { mensajeDe } from '~/lib/registroDeErrores';

// Subir el manual (PDF) de un equipo, de hasta 200 MB. El archivo viaja solo (no en un formulario) y se guarda a medida que llega: no se
// tiene entero en memoria. Nginx deja pasar pedidos así de grandes solo para esta dirección (servidor/nginx.conf). Después se reacomoda
// para verlo por partes (~/lib/pdf). Queda en la carpeta privada "manuales" (se abre con manuales/[id], que revisa quién lo pide).
// Equipo y nombre van en la dirección: ?equipo=…&nombre=…
const MAXIMO_DE_MANUAL = 200 * 1024 * 1024;

export async function POST(pedido: Request) {
  const dir = new URL(pedido.url).searchParams;
  const equipoId = dir.get('equipo') ?? '';
  const nombre = (dir.get('nombre') || 'Manual.pdf').trim().slice(0, 200);
  const usuario = await entrada('subirManual', [Id, Texto(300)], [equipoId, nombre]);
  if (!/^[0-9a-f-]{36}$/i.test(equipoId) || !pedido.body) return Response.json({ error: 'El archivo no es válido' });
  if (Number(pedido.headers.get('content-length') ?? 0) > MAXIMO_DE_MANUAL) return Response.json({ error: `"${nombre}" pesa más de 200 MB: no se puede subir.` });

  // antes de recibir el archivo: que esta persona pueda subir manuales (si no, no se guarda nada)
  const puede = await comoUsuario(usuario, async c => (await c.query<{ ok: boolean }>('select public.administra_equipos() as ok')).rows[0]?.ok);
  if (!puede) return Response.json({ error: 'Solo quien administra Mantenimiento puede subir manuales.' });

  // cada empresa en su carpeta, y cada equipo en la suya
  const ruta = `${(await contexto()).empresaId}/${equipoId}/${randomUUID()}.pdf`;
  try {
    // tiene que ser un PDF de verdad (se mira cómo empieza el archivo, no lo que dice el navegador)
    await guardarDesdeFlujo('manuales', ruta, pedido.body, MAXIMO_DE_MANUAL, '%PDF-');
  } catch (e) {
    const x = e as { demasiadoGrande?: boolean; formatoIncorrecto?: boolean };
    return Response.json({ error: x.demasiadoGrande ? `"${nombre}" pesa más de 200 MB: no se puede subir.` : x.formatoIncorrecto ? `"${nombre}" no es un PDF.`
      : 'No se pudo recibir el manual entero (¿se cortó internet?). Probá de nuevo.' });
  }
  const datos = await datosDelArchivo('manuales', ruta);
  if (datos) await optimizarParaVerPorPartes(datos.archivo);
  const tamanio = (await datosDelArchivo('manuales', ruta))?.tamanio ?? 0;
  try {
    await comoUsuario(usuario, async c => {
      await c.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('manuales', $1, auth.uid(), $2)`,
        [ruta, JSON.stringify({ size: tamanio, mimetype: 'application/pdf' })]);
      await c.query('insert into public.equipo_manuales (equipo_id, nombre, ruta, tamanio_bytes, subido_por) values ($1, $2, $3, $4, auth.uid())',
        [equipoId, nombre, ruta, tamanio]);
    });
  } catch (e) {
    await borrarArchivo('manuales', ruta);
    return Response.json({ error: mensajeDe(e, 'No se pudo subir el manual. Probá de nuevo.') });
  }
  revalidatePath('/mantenimiento');
  return Response.json({ error: null });
}
