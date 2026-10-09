/* eslint-disable no-restricted-globals */
/**
 * Service worker рабочего места оператора: оболочка приложения открывается без
 * сети (офис без Wi-Fi, подвал). Данные — не здесь: их кэширует TanStack Query
 * в памяти страницы, а действия без сети копятся в очереди (localStorage +
 * IndexedDB). API-запросы никогда не кэшируются.
 *
 *  - навигация: сеть, при отказе — закэшированный index.html;
 *  - /assets/ (хэшированные бандлы Vite): кэш, иначе сеть и в кэш;
 *  - планы этажей и фото (/minio/, :9000): stale-while-revalidate;
 *  - версия кэша меняется при каждой сборке (подставляется Vite'ом? нет —
 *    вручную: достаточно, что index.html отдаётся с no-store, а ассеты хэшированы).
 */
const SHELL_CACHE = 'cf-op-shell-v1';
const ASSET_CACHE = 'cf-op-assets-v1';
const MEDIA_CACHE = 'cf-op-media-v1';
const SCOPE = self.registration.scope; // например https://cleanfine.ru/app/
const INDEX_URL = new URL('./', SCOPE).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(INDEX_URL, { cache: 'reload' })))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, ASSET_CACHE, MEDIA_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

function isApi(url) {
  return url.pathname.includes('/api/') || url.pathname.startsWith('/socket.io');
}

function isMedia(url) {
  return (
    url.pathname.includes('/minio/') ||
    url.port === '9000' ||
    /\.(png|jpe?g|webp)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isApi(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(SHELL_CACHE)
            .then((cache) => cache.put(INDEX_URL, copy))
            .catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(INDEX_URL).then((cached) => cached || Response.error())),
    );
    return;
  }

  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches
              .open(ASSET_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => undefined);
            return response;
          }),
      ),
    );
    return;
  }

  if (isMedia(url)) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone()).catch(() => undefined);
              return response;
            })
            .catch(() => cached || Response.error());
          return cached || network;
        }),
      ),
    );
  }
});

// ---------------------------------------------------------------- Web Push
// Сервер (notification-service, VAPID) присылает JSON {title, body, type, data}.
// Показываем системное уведомление и по нажатию открываем нужный экран PWA.
function targetPath(data) {
  const base = new URL('./', SCOPE).pathname; // /app/
  if (data && data.chatId) return `${base}chats/${data.chatId}`;
  if (data && data.ticketId) return `${base}today?ticket=${data.ticketId}`;
  return `${base}notifications`;
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
    icon: new URL('./icons/icon-192.png', SCOPE).toString(),
    badge: new URL('./icons/icon-192.png', SCOPE).toString(),
    tag: (payload.data && (payload.data.chatId || payload.data.ticketId)) || undefined,
    renotify: true,
    vibrate: payload.priority === 'high' ? [200, 100, 200, 100, 200] : [100],
    data: Object.assign({}, payload.data || {}, { type: payload.type }),
  };
  event.waitUntil(self.registration.showNotification(payload.title || 'CLEANFINE', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = targetPath(event.notification.data);
  const url = new URL(path, self.location.origin).toString();
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

