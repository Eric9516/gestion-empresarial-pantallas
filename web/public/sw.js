// Los avisos al celular de Mantenimiento: el servidor los manda (web/src/lib/avisosAlCelular.ts) y este archivo los muestra, aunque la app
// esté cerrada. Al tocar uno, abre la OT (en la ventana de la app si ya estaba abierta). No guarda pantallas ni datos: la app sigue
// funcionando igual que siempre, con conexión.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', evento => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', evento => {
  let aviso = {};
  try { aviso = evento.data ? evento.data.json() : {}; } catch { aviso = { titulo: evento.data ? evento.data.text() : '' }; }
  evento.waitUntil(self.registration.showNotification(aviso.titulo || 'Mantenimiento', {
    body: aviso.cuerpo || '',
    tag: aviso.etiqueta || undefined,
    renotify: Boolean(aviso.etiqueta),
    icon: aviso.icono || '/icono?t=192',
    badge: aviso.insignia || '/icono?t=96',
    lang: 'es',
    data: { url: aviso.url || '/mantenimiento/inicio' },
  }));
});

self.addEventListener('notificationclick', evento => {
  evento.notification.close();
  const url = new URL(evento.notification.data?.url || '/mantenimiento/inicio', self.location.origin).href;
  evento.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const abierta = ventanas.find(v => new URL(v.url).origin === self.location.origin);
    if (abierta) {
      await abierta.focus();
      return abierta.navigate(url).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  })());
});
