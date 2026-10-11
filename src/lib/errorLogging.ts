import * as Sentry from '@sentry/react';
import { supabase } from './supabaseClient';

const MAX_ERRORES_POR_SESION = 20;
let loggedCount = 0;
let installed = false;
let currentUserId: string | null = null;
let currentUserEmail: string | null = null;

export async function registrarError(mensaje: unknown, stack: unknown) {
  if (!currentUserId) return;
  if (loggedCount >= MAX_ERRORES_POR_SESION) return;
  loggedCount++;
  try {
    await supabase.from('error_logs').insert({
      usuario_id: currentUserId,
      usuario_email: currentUserEmail,
      mensaje: String(mensaje || 'Error desconocido').slice(0, 2000),
      stack: stack ? String(stack).slice(0, 4000) : null,
      pantalla: window.location.pathname,
      url: window.location.href,
      user_agent: navigator.userAgent,
    });
  } catch {
    // Si falla el guardado del error, no queremos generar otro error por eso.
  }
}

// Para loguear a mano un error ya atrapado en un try/catch (a diferencia de
// registrarError, que solo agarra errores no atrapados). Guarda código +
// descripción en criollo en "mensaje", y el detalle técnico (lo que tira la
// consola) en "stack" — así cualquiera que lo vea en la sección de Errores
// entiende qué pasó sin tener que leer una traza.
export async function registrarErrorAccion(descripcion: string, err: unknown) {
  const codigo = (err as { code?: string })?.code ?? 'ERR';
  // Los errores de Supabase son objetos planos ({ message, details, hint, code }),
  // no Error: String() los dejaría en "[object Object]" y se perdería el detalle.
  const detalle = err instanceof Error ? (err.stack ?? err.message) : typeof err === 'object' && err ? JSON.stringify(err) : String(err);
  Sentry.captureException(err instanceof Error ? err : new Error(`[${codigo}] ${descripcion}`), { extra: { descripcion, detalle } });
  await registrarError(`[${codigo}] ${descripcion}`, detalle);
}

export function setErrorLoggingUser(userId: string | null, email: string | null) {
  currentUserId = userId;
  currentUserEmail = email;
  // Solo el id (sin email) para poder ubicar al usuario sin mandar datos personales.
  Sentry.setUser(userId ? { id: userId } : null);
}

export function installErrorLogging() {
  if (installed) return;
  installed = true;
  window.addEventListener('error', e => {
    void registrarError(e.message, e.error?.stack);
  });
  window.addEventListener('unhandledrejection', e => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    void registrarError(reason?.message || String(reason), reason?.stack);
  });
}
