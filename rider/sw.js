const CACHE_NAME = 'roshani-rider-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

// PUSH NOTIFICATIONS
self.addEventListener('push', (e) => {
  let data = { title: 'New Update', body: 'Check your rider portal.', url: './index.html' };
  try {
    if (e.data) {
      const parsed = e.data.json();
      data = { ...data, ...parsed };
    }
  } catch (err) {
    console.error('Failed to parse push data:', err);
  }
  const options = {
    body: data.body,
    icon: './icon-512.png',
    badge: './icon-512.png',
    vibrate: [100, 50, 100],
    data: { url: data.url }
  };
  e.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const resolvedUrl = new URL(data.url, self.location.origin).href;
      for (const client of clientList) {
        if (client.url === resolvedUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(data.url);
    })
  );
});

