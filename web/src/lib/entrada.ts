import 'server-only';
import { z } from 'zod';
import { exigirUsuario } from './sesion';

// La puerta de cada acción del servidor. Una acción es una dirección pública: cualquiera con sesión puede llamarla con lo que quiera, y los
// tipos de TypeScript no existen al correr. Por eso cada una empieza con entrada(), que:
//  1. exige la sesión (sin sesión, a /entrar);
//  2. frena a quien hace demasiados pedidos (un programa, no una persona);
//  3. revisa con Zod que lo que llegó tenga la forma esperada: tipos, largos, valores permitidos. Las pantallas nunca mandan otra cosa,
//     así que si no coincide es un pedido armado a mano: se rechaza sin tocar la base y queda en el registro.
// Después cada acción sigue igual: recorta los textos, la base revisa los permisos (sus reglas) y las consultas van con parámetros.

/** Pedidos por persona por minuto: una persona trabajando rápido hace pocas decenas; un programa, miles. */
const TOPE_POR_MINUTO = 300;
const pedidosPorPersona = new Map<string, { desde: number; cantidad: number }>();

// (la cuenta vive en la memoria del proceso: hay uno solo; con varios, iría a la base)
function dentroDelLimite(usuario: string): boolean {
  const ahora = Date.now();
  const cuenta = pedidosPorPersona.get(usuario);
  if (!cuenta || ahora - cuenta.desde >= 60_000) {
    if (pedidosPorPersona.size > 10_000) pedidosPorPersona.clear();
    pedidosPorPersona.set(usuario, { desde: ahora, cantidad: 1 });
    return true;
  }
  cuenta.cantidad += 1;
  return cuenta.cantidad <= TOPE_POR_MINUTO;
}

export class PedidoRechazado extends Error {}

/** Exige la sesión, aplica el límite y revisa los datos (uno por argumento, en orden). Devuelve quién es. */
export async function entrada(accion: string, esquemas: z.ZodType[] = [], valores: unknown[] = []): Promise<string> {
  const usuario = await exigirUsuario();
  if (!dentroDelLimite(usuario)) {
    console.warn(`[entrada] ${accion}: demasiados pedidos de ${usuario}`);
    throw new PedidoRechazado('Demasiados pedidos seguidos. Esperá un minuto y probá de nuevo.');
  }
  const revision = z.tuple(esquemas as [z.ZodType, ...z.ZodType[]]).safeParse(valores.slice(0, esquemas.length));
  if (!revision.success || valores.length > esquemas.length) {
    // solo dónde falló, nunca los valores (pueden tener datos de la persona)
    const donde = revision.success ? 'argumentos de más' : revision.error.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.code}`).join(', ');
    console.warn(`[entrada] ${accion}: datos rechazados de ${usuario} (${donde})`);
    throw new PedidoRechazado('Los datos no son válidos');
  }
  return usuario;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Las piezas para describir lo que recibe cada acción. Los largos son topes contra abusos (más que lo que deja escribir cada pantalla):
// cada acción después recorta al largo de su columna.
// ---------------------------------------------------------------------------------------------------------------------------------------------

/** El id de un registro (uuid de cualquier versión). */
export const Id = z.guid();
export const IdONulo = Id.nullable();
/** Ids que son números (modelos de rótulo, historial). */
export const IdNumerico = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const Texto = (maximo = 500) => z.string().max(maximo);
export const TextoONulo = (maximo = 500) => Texto(maximo).nullish();
/** Fechas y momentos: la base los interpreta (y rechaza los que no son); acá solo se acota el largo. */
export const Fecha = Texto(40);
export const FechaONula = Fecha.nullish();
export const SiNo = z.boolean();
export const SiNoONulo = SiNo.nullish();
export const Numero = (minimo = -1e9, maximo = 1e9) => z.number().finite().min(minimo).max(maximo);
/** Una cantidad: número, o el texto de un campo (cada acción la pasa a número y la base la valida). */
export const Cantidad = z.union([z.number().finite().min(-1e9).max(1e9), z.string().max(30)]);
export const Lista = <T extends z.ZodType>(de: T, maximo: number) => z.array(de).max(maximo);
/** Algo que se guarda tal cual (diseños, campos a medida): cualquier forma, pero con tope de tamaño. */
export const Json = (maximoDeBytes: number) => z.unknown().refine(v => (JSON.stringify(v ?? null)?.length ?? 0) <= maximoDeBytes, 'demasiado grande');
/** Una página de una lista larga: el último que se vio. */
export const CursorDePagina = z.object({ created_at: Fecha, id: Id }).nullish();
/** Lo que viene de una celda de Excel: texto o número. */
export const Celda = z.union([Texto(2000), z.number().finite()]).nullish();
/** Archivos subidos (fotos, planillas): el tamaño lo frena Next (6 MB) y el tipo lo revisa cada acción. */
export const Formulario = z.instanceof(FormData);
