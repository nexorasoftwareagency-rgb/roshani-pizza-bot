const CACHE_NAME = 'roshani-erp-v3.2';
const ASSETS_TO_CACHE = [
  'index.html',
  'style.css',
  'app.js',
  'branding.js',
  'manifest-pizza.json',
  'manifest-cake.json',
  'https://unpkg.com/lucide@latest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'assets/sounds/alert.mp3' // Add your notification sound path here
];

// 1. Install Event: Cache UI Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

// 3. Fetch Event: Network-First Strategy
self.addEventListener('fetch', (event) => {
  // Skip Firebase Realtime Database calls (must be live)
  if (event.request.url.includes('firebaseio.com')) return;

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

// 4. Push Notification Event
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'New Alert', body: 'Check your dashboard.' };
  const options = {
    body: data.body,
    icon: 'icon-512.png',
    badge: 'icon-192.png',
    vibrate: [100, 50, 100],
    data: { url: 'index.html' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 5. Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || 'index.html')
  );
});