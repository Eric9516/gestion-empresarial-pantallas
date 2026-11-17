import 'server-only';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';

// Los archivos subidos (fotos de repuestos, y más adelante rótulos y logos) se guardan en disco, en una carpeta por "bucket", como en Supabase.
// El registro de cada uno (y quién puede subir o borrar) está en storage.objects, con las mismas reglas que allá.
// En el servidor la carpeta es /srv/archivos (ARCHIVOS_DIR) y Nginx los sirve directo; en la computadora, web/.archivos.
const RAIZ = process.env.ARCHIVOS_DIR ?? join(process.cwd(), '.archivos');

/** Las carpetas que se pueden ver sin sesión (las mismas que en Supabase son públicas). */
export const BUCKETS_PUBLICOS = new Set(['items', 'rotulos', 'documentos']);

/** La dirección con la que se muestra un archivo (la sirve /archivos/…: Nginx en el servidor, Next en la computadora). */
export const urlPublica = (bucket: string, ruta: string) => `/archivos/${bucket}/${ruta}`;

/** El archivo en disco; null si la ruta intenta salirse de la carpeta (por ejemplo con "../"). */
function enDisco(bucket: string, ruta: string): string | null {
  if (!/^[a-z0-9_-]+$/.test(bucket)) return null;
  // (turbopackIgnore: son archivos subidos, no del programa; sin esto, Next mete el proyecto entero en el paquete que se publica)
  const carpeta = join(/*turbopackIgnore: true*/ RAIZ, bucket);
  const archivo = normalize(join(/*turbopackIgnore: true*/ carpeta, ruta));
  return archivo.startsWith(carpeta + sep) ? archivo : null;
}

export async function guardarArchivo(bucket: string, ruta: string, contenido: Buffer): Promise<void> {
  const archivo = enDisco(bucket, ruta);
  if (!archivo) throw new Error('Ruta de archivo no válida');
  await mkdir(dirname(archivo), { recursive: true });
  await writeFile(archivo, contenido);
}

/**
 * Guarda lo que va llegando (un manual de 90 MB no se tiene entero en memoria). Corta si pasa del máximo o si el principio no es el esperado
 * (por ejemplo, "%PDF-"): en esos casos borra lo guardado y lanza un Error con el motivo. Devuelve cuántos bytes guardó.
 */
export async function guardarDesdeFlujo(bucket: string, ruta: string, flujo: ReadableStream<Uint8Array>, maximo: number, empiezaCon?: string): Promise<number> {
  const archivo = enDisco(bucket, ruta);
  if (!archivo) throw new Error('Ruta de archivo no válida');
  await mkdir(dirname(archivo), { recursive: true });
  const salida = createWriteStream(/*turbopackIgnore: true*/ archivo);
  let bytes = 0;
  let inicio = Buffer.alloc(0);
  try {
    for await (const parte of flujo as unknown as AsyncIterable<Uint8Array>) {
      bytes += parte.length;
      if (bytes > maximo) throw Object.assign(new Error('demasiado grande'), { demasiadoGrande: true });
      if (empiezaCon && inicio.length < empiezaCon.length) {
        inicio = Buffer.concat([inicio, Buffer.from(parte)]);
        if (inicio.length >= empiezaCon.length && inicio.subarray(0, empiezaCon.length).toString('latin1') !== empiezaCon) {
          throw Object.assign(new Error('formato'), { formatoIncorrecto: true });
        }
      }
      if (!salida.write(parte)) await new Promise<void>(r => salida.once('drain', () => r()));
    }
    await new Promise<void>((listo, mal) => salida.end((e?: Error | null) => (e ? mal(e) : listo())));
    if (empiezaCon && inicio.length < empiezaCon.length) throw Object.assign(new Error('formato'), { formatoIncorrecto: true });
    return bytes;
  } catch (e) {
    salida.destroy();
    await rm(archivo, { force: true });
    throw e;
  }
}

/** Dónde está el archivo y cuánto pesa (para mandarlo por partes); null si no existe. */
export async function datosDelArchivo(bucket: string, ruta: string): Promise<{ archivo: string; tamanio: number } | null> {
  const archivo = enDisco(bucket, ruta);
  if (!archivo) return null;
  const s = await stat(/*turbopackIgnore: true*/ archivo).catch(() => null);
  return s?.isFile() ? { archivo, tamanio: s.size } : null;
}

export async function borrarArchivo(bucket: string, ruta: string): Promise<void> {
  const archivo = enDisco(bucket, ruta);
  if (archivo) await rm(archivo, { force: true });
}

export async function leerArchivo(bucket: string, ruta: string): Promise<Buffer | null> {
  const archivo = enDisco(bucket, ruta);
  if (!archivo) return null;
  return readFile(/*turbopackIgnore: true*/ archivo).catch(() => null);
}

/** De una dirección de las nuestras (/archivos/items/…), su ruta dentro del bucket; null si es de otro lado (por ejemplo, de Supabase). */
export function rutaDeUrl(bucket: string, url: string): string | null {
  const prefijo = `/archivos/${bucket}/`;
  return url.startsWith(prefijo) ? url.slice(prefijo.length) : null;
}
