// Fail-fast if not on HTTPS (security best practice for Phase 2.20)
if (self.location.protocol !== 'https:' && self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
  throw new Error('Service Worker requires HTTPS');
}

const CACHE_NAME = 'roshani-rider-v5.1-premium';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './style.css',
  './app.js',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap'
];

// Install Event - Precache core assets
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate Event - Clean up old caches to ensure the new UI loads
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Handle offline routing
self.addEventListener('fetch', (e) => {
  // Only cache GET requests
  if (e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// Push Notifications Setup (Firebase Cloud Messaging Background Handler)
self.addEventListener('push', (e) => {
  let data = { title: 'New Order', body: 'Check your rider portal.', url: './index.html' };

  try {
    if (e.data) {
      const parsed = e.data.json();
      data = { ...data, ...parsed };
    }
  } catch (err) {
    console.error('Push data error:', err);
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

// Notification Click Handler - Open app when notification is tapped
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const resolvedUrl = new URL(e.notification.data.url, self.location.origin).href;
      // If window is already open, focus it
      for (const client of clientList) {
        if (client.url === resolvedUrl && 'focus' in client) return client.focus();
      }
      // Otherwise, open a new window
      if (clients.openWindow) return clients.openWindow(e.notification.data.url);
    })
  );
});