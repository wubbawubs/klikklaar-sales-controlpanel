const CACHE_NAME = 'klikklaar-shell-v1';
const SHELL_URLS = ['/'];

// Install — cache minimal shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for navigation, cache-first for shell
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
  }
});

// Push — show notification
self.addEventListener('push', (event) => {
  let data = { title: 'KlikKlaar', body: 'Je hebt een nieuw bericht', action_url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // fallback to defaults
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { action_url: data.action_url || '/' },
    vibrate: [200, 100, 200],
    tag: data.type || 'default',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options).then(() => {
      // Update badge count
      if ('setAppBadge' in navigator) {
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'BADGE_UPDATE' }));
        });
      }
    })
  );
});

// Notification click — deep link
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.action_url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => new URL(c.url).pathname === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
