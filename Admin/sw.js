// Fail-fast if not on HTTPS (security best practice for Phase 2.20)
if (self.location.protocol !== 'https:' && self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
  throw new Error('Service Worker requires HTTPS');
}

const CACHE_NAME = 'roshani-erp-v4.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './mobile-overrides.css',
  './branding.js',
  './firebase-config.js',
  './manifest-pizza.json',
  './manifest-cake.json',
  './js/main.js',
  './js/auth.js',
  './js/firebase.js',
  './js/state.js',
  './js/ui.js',
  './js/utils.js',
  './js/pwa.js',
  './js/features/orders.js',
  './js/features/riders.js',
  './js/features/catalog.js',
  './js/features/customers.js',
  './js/features/pos.js',
  './js/features/settings.js',
  './js/features/tracker.js',
  './js/features/feedback.js',
  './js/features/notifications.js',
  './js/features/printing.js',
  'https://unpkg.com/lucide@0.344.0/dist/umd/lucide.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  './assets/sounds/alert.mp3'
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
  self.clients.claim();
});

// 3. Fetch Event: Network-First Strategy with Cache Fallback
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') return;

  // Skip Firebase Realtime Database calls (must be live)
  if (event.request.url.includes('firebaseio.com')) return;
  
  // Skip Firebase Auth calls - real endpoints
  if (event.request.url.includes('identitytoolkit.googleapis.com')) return;
  if (event.request.url.includes('securetoken.googleapis.com')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clonedResponse);
          });
        }
        return response;
      })
      .catch(() => {
        // Return cached version if offline
        return caches.match(event.request);
      })
  );
});

// 4. Push Notification Event
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'New Alert', body: 'Check your dashboard.' };
  const options = {
    body: data.body,
    icon: './icon-pizza.webp',
    badge: './icon-pizza.webp',
    vibrate: [100, 50, 100],
    data: { url: './index.html' },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// 5. Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || './index.html')
    );
  }
});