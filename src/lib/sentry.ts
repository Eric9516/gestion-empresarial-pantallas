import * as Sentry from '@sentry/react';

// Sin VITE_SENTRY_DSN no se inicia nada: la app funciona igual y no sale ningún dato.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
  });
}
