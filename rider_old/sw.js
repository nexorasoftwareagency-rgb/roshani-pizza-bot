// Fail-fast if not on HTTPS (security best practice)
if (self.location.protocol !== 'https:' && self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
  throw new Error('Service Worker requires HTTPS');
}

const CACHE_NAME = 'roshani-rider-v6.4-premium';
const ASSETS = [
  './',
  './login.html',
  './style.css',
  './icon-512.png',
  './assets/sounds/alert.mp3',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install Event - Precache core assets
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate Event - Clean up old caches
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

// Fetch Event - Strategic Caching with robust error handling
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  
  // Strategy: Network-First for high-priority app files
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname === '/') {
    e.respondWith(async function() {
      try {
        const networkResponse = await fetch(e.request);
        if (networkResponse && networkResponse.ok) return networkResponse;
        throw new Error('Network response not ok');
      } catch (err) {
        const cachedResponse = await caches.match(e.request);
        if (cachedResponse) return cachedResponse;
        return new Response('Offline: Resource not in cache.', { 
          status: 503, 
          headers: { 'Content-Type': 'text/plain' } 
        });
      }
    }());
    return;
  }

  // Strategy: Cache-First for assets and external libraries
  if (url.pathname.includes('/assets/') || url.hostname.includes('fonts.') || url.hostname.includes('unpkg.com') || url.hostname.includes('cloudflare.com')) {
    e.respondWith(async function() {
      const cachedResponse = await caches.match(e.request);
      if (cachedResponse) return cachedResponse;
      try {
        const networkResponse = await fetch(e.request);
        return networkResponse;
      } catch (err) {
        return new Response('Asset Offline', { status: 404 });
      }
    }());
    return;
  }

  // Default Strategy: Network only with cache fallback
  e.respondWith(async function() {
    try {
      return await fetch(e.request);
    } catch (err) {
      const cached = await caches.match(e.request);
      return cached || new Response('Network Error', { status: 408 });
    }
  }());
});

// Push Notifications Setup
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

// Notification Click Handler
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      const resolvedUrl = new URL(e.notification.data.url, self.location.origin).href;
      for (const client of clientList) {
        if (client.url === resolvedUrl && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(e.notification.data.url);
    })
  );
});