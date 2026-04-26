const CACHE_NAME = 'roshani-admin-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=3.2.0',
  './app.js?v=3.1.0',
  './branding.js?v=3.1.0',
  './manifest-pizza.json?v=2',
  './manifest-cake.json',
  './icon-pizza.png',
  './icon-cake.png'
];

// Force activation and cache latest assets
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Clear old caches and claim clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        );
      })
    ])
  );
});

// Cache strategy: Network-First for core logic, Cache-First for assets
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (url.includes('app.js') || url.includes('index.html') || url.includes('style.css')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
  }
});

// Handle notification interaction
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/Admin/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});
