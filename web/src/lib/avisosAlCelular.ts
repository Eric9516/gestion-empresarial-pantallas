import 'server-only';
import webpush from 'web-push';
import { repartirAvisos, type AvisoPendiente } from '@/features/mantenimiento/avisosCelular';
import { base } from './db';

// Los avisos al celular de Mantenimiento: el servidor los manda cada minuto. Lo arranca instrumentation.ts al prender la app (un solo proceso).
// Usa los avisos de los propios navegadores ("web push": Google, Apple y Mozilla los entregan gratis). Las claves del servidor (VAPID) se
// crean solas la primera vez y quedan en la base (web/db/05-avisos.sql).

interface Claves { publica: string; privada: string; sujeto: string }
let claves: Claves | null = null;

/**
 * Las claves del servidor; si no hay, las crea. `sujeto` es la dirección de la app (los servicios de avisos la piden para saber de quién
 * vienen): la toma del primer pedido que las necesita.
 */
export async function clavesDeAvisos(direccion?: string): Promise<Claves | null> {
  if (claves) return claves;
  const { rows } = await base.query<Claves>('select * from servidor.claves_de_avisos()');
  if (rows[0]) return (claves = rows[0]);
  if (!direccion) return null;
  const nuevas = webpush.generateVAPIDKeys();
  const guardadas = await base.query<Claves>('select * from servidor.guardar_claves_de_avisos($1, $2, $3)', [nuevas.publicKey, nuevas.privateKey, direccion]);
  return (claves = guardadas.rows[0] ?? null);
}

/** Una vuelta: arma el resumen de la mañana (si es la hora) y manda lo pendiente. Devuelve cuántos avisos salieron. */
export async function mandarAvisos(): Promise<number> {
  await base.query('select servidor.armar_resumenes_para_derivar()');
  const { rows } = await base.query<AvisoPendiente>('select * from servidor.avisos_para_mandar()');
  if (!rows.length) return 0;
  const { envios, descartar } = repartirAvisos(rows);
  const listos = [...descartar];
  const c = envios.length ? await clavesDeAvisos() : null;
  let mandados = 0;
  for (const e of envios) {
    if (!c) { listos.push(...e.ids); continue; }
    const cuerpo = JSON.stringify(e.mensaje);
    for (const cel of e.celulares) {
      try {
        await webpush.sendNotification({ endpoint: cel.endpoint, keys: { p256dh: cel.p256dh, auth: cel.auth } }, cuerpo, {
          vapidDetails: { subject: c.sujeto, publicKey: c.publica, privateKey: c.privada },
          // si el celular está apagado, el servicio lo guarda hasta un día; los de la OT son urgentes (que suene aunque ahorre batería)
          TTL: 24 * 60 * 60, urgency: 'high', timeout: 10_000,
        });
        mandados++;
      } catch (error) {
        const estado = (error as { statusCode?: number }).statusCode;
        // 404/410: ese celular ya no recibe (desinstaló, borró los datos o sacó el permiso). Se olvida.
        if (estado === 404 || estado === 410) await base.query('select servidor.olvidar_celular($1)', [cel.endpoint]);
        else console.warn(`[avisos] no se pudo mandar un aviso (${estado ?? (error as Error).message})`);
      }
    }
    // mandado o no (un celular caído no se reintenta para siempre): no se repite
    listos.push(...e.ids);
  }
  await base.query('select servidor.avisos_mandados($1::uuid[])', [listos]);
  return mandados;
}

const global_ = globalThis as typeof globalThis & { __avisos?: ReturnType<typeof setInterval> };

/** Arranca la vuelta de cada minuto (una sola vez por proceso, aunque en desarrollo Next recargue el módulo). */
export function arrancarAvisos(): void {
  if (global_.__avisos || process.env.SIN_AVISOS === '1') return;
  let ocupado = false;
  const vuelta = async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      await mandarAvisos();
    } catch (e) {
      console.warn(`[avisos] falló una vuelta: ${(e as Error).message}`);
    } finally {
      ocupado = false;
    }
  };
  global_.__avisos = setInterval(vuelta, 60_000);
  global_.__avisos.unref?.();
  setTimeout(vuelta, 15_000).unref?.();
}
