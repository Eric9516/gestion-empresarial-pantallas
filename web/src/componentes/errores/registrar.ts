import { esDeUnaVersionVieja, mensajeDeError } from '@/lib/errores';
import { anotarErrorDeLaPantalla } from './acciones';

// Los errores de las pantallas van a Configuración → Errores. Hasta 20 por pantalla abierta: un error que se repite en bucle no satura
// el servidor. Las acciones de una versión anterior de la app no son errores (se recarga: AvisoDeVersionNueva).

const TOPE = 20;
let enviados = 0;

const detalleDe = (e: unknown) => (e instanceof Error ? (e.stack ?? e.message) : typeof e === 'object' && e ? JSON.stringify(e) : String(e));

async function enviar(mensaje: string, detalle: string | null) {
  if (enviados >= TOPE) return;
  enviados += 1;
  try {
    await anotarErrorDeLaPantalla({ mensaje: mensaje.slice(0, 2000), detalle: detalle?.slice(0, 4000) ?? null, url: location.href.slice(0, 2000) });
  } catch { /* si no se puede anotar, no se arma otro error por eso */ }
}

/** Un error que atrapó la pantalla (al guardar, al armar un PDF…): la descripción dice qué se estaba haciendo. */
export async function registrarError(descripcion: string, err: unknown) {
  console.error(descripcion, err);
  if (esDeUnaVersionVieja(err)) return;
  const codigo = (err as { code?: unknown } | null)?.code;
  const texto = mensajeDeError(err);
  await enviar(`${typeof codigo === 'string' ? `[${codigo}] ` : ''}${descripcion}${texto ? `: ${texto}` : ''}`, detalleDe(err));
}

/** Un error que nadie atrapó en la pantalla. */
export async function registrarErrorSinAtrapar(err: unknown) {
  if (esDeUnaVersionVieja(err)) return;
  await enviar(mensajeDeError(err) || 'Error desconocido', detalleDe(err));
}
