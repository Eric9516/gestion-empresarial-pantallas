import 'server-only';
import { Pool, types, type PoolClient } from 'pg';

// Los días (columnas date) llegan como texto "aaaa-mm-dd", igual que con Supabase: si se volvieran fecha con hora, según el huso horario
// podrían correrse un día.
types.setTypeParser(types.builtins.DATE, v => v);

// Una sola conexión compartida por proceso (en desarrollo, Next recarga los módulos: se guarda en globalThis para no abrir otra cada vez).
const global_ = globalThis as typeof globalThis & { __base?: Pool };
export const base = global_.__base ??= new Pool({
  connectionString: process.env.DATABASE_URL,
  // (las pruebas de pantalla usan una base en memoria que atiende de a una conexión: ver e2e/next)
  max: Number(process.env.CONEXIONES_DE_LA_BASE) || 10,
  idleTimeoutMillis: 30_000,
  application_name: 'gestion-web',
});

async function enTransaccion<T>(preparar: (c: PoolClient) => Promise<unknown>, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await base.connect();
  try {
    await c.query('begin');
    await preparar(c);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Consultas como el usuario: la base sabe quién es (auth.uid()) y aplica sus reglas de seguridad, igual que con Supabase.
 * Todo lo de adentro va en una transacción; el rol y el usuario valen solo para ella.
 */
export function comoUsuario<T>(usuarioId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return enTransaccion(async c => c.query(
    `select set_config('role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true),
            set_config('app.deposito', $2, true)`,
    [usuarioId, await depositoElegido()],
  ), fn);
}

/** El nombre de la cookie con el depósito que la persona eligió arriba (ver ~/app/(app)/deposito/elegirDeposito.ts). */
export const COOKIE_DEL_DEPOSITO = 'deposito';

/**
 * El depósito que la persona eligió en el selector de arriba (vacío si no eligió, o fuera de un pedido). La base solo lo usa si es uno de
 * los suyos (public.deposito_actual()): una cookie cambiada a mano no da acceso a nada.
 */
async function depositoElegido(): Promise<string> {
  try {
    const { cookies } = await import('next/headers');
    const v = (await cookies()).get(COOKIE_DEL_DEPOSITO)?.value ?? '';
    return /^[0-9a-f-]{36}$/i.test(v) ? v : '';
  } catch {
    return '';
  }
}

/**
 * Consultas sin sesión (por ejemplo, el nombre y el logo de la empresa en la pantalla de entrada). Con varias empresas en la base, se dice
 * de cuál (si no, la regla de cada tabla no deja ver nada).
 */
export function comoAnonimo<T>(fn: (c: PoolClient) => Promise<T>, empresa?: string | null): Promise<T> {
  return enTransaccion(c => c.query(`select set_config('role', 'anon', true), set_config('app.empresa', $1, true)`, [empresa ?? '']), fn);
}
