/* eslint-disable no-restricted-globals */
/**
 * Service worker админки (12.10.2026) — только Web Push: показать системное
 * уведомление и открыть нужный раздел по нажатию. Кэширования нет: админка
 * работает онлайн, а устаревшая оболочка после выката мешала бы.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function targetPath(data) {
  if (data && data.chatId) return `/messages?chat=${encodeURIComponent(data.chatId)}`;
  if (data && data.ticketId) return `/tickets/${data.ticketId}`;
  return '/notifications';
}

self.addEventListener('push', (event) => {
  let payload = { title: 'CLEANFINE', body: '', data: {} };
  try {
    payload = Object.assign(payload, event.data ? event.data.json() : {});
  } catch {
    payload.body = event.data ? event.data.text() : '';
  }
  const options = {
    body: payload.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: (payload.data && (payload.data.chatId || payload.data.ticketId)) || undefined,
    renotify: true,
    requireInteraction: payload.priority === 'high',
    vibrate: payload.priority === 'high' ? [200, 100, 200, 100, 200] : [100],
    data: Object.assign({}, payload.data || {}, { type: payload.type }),
  };
  event.waitUntil(self.registration.showNotification(payload.title || 'CLEANFINE', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(targetPath(event.notification.data), self.location.origin).toString();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
