// Fail-fast if not on HTTPS
if (self.location.protocol !== 'https:' && self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
  throw new Error('Service Worker requires HTTPS');
}

// Firebase Messaging is handled by firebase-messaging-sw.js (auto-registered by Firebase SDK)
// This SW handles caching, navigation, and offline support only.

const CACHE_NAME = 'roshani-erp-v5.1.1';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './mobile-overrides.css',
  './branding.js',
  './firebase-config.js',
  './receipt-templates.js',
  './manifest.json',
  './icon-erp-logo.jpeg',
  './js/main.js',
  './js/auth.js',
  './js/firebase.js',
  './js/state.js',
  './js/ui.js',
  './js/ui-utils.js',
  './js/utils.js',
  './js/pwa.js',
  './js/gestures.js',
  './js/features/orders.js',
  './js/features/riders.js',
  './js/features/catalog.js',
  './js/features/customers.js',
  './js/features/analytics.js',
  './js/features/lost-sales.js',
  './js/features/pos.js',
  './js/features/settings.js',
  './js/features/tracker.js',
  './js/features/feedback.js',
  './js/features/notifications.js',
  './js/fcm-init.js',
  './js/fcm-sender.js',
  './js/features/printing.js',
  './js/features/rider-analytics.js',
  './js/features/inventory.js',
  'https://unpkg.com/lucide@0.344.0/dist/umd/lucide.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
  './assets/sounds/alert.mp3'
];

// 1. Install Event: Cache UI Assets (per-asset resilience)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS_TO_CACHE) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn('[SW] Failed to cache:', url);
        }
      }
    }).then(() => self.skipWaiting())
  );
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

// 3. Fetch Event: Dual Strategy (Cache-First for CDN, Network-First for everything else)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  // Skip Firebase Realtime Database calls (must be live)
  if (event.request.url.includes('firebaseio.com')) return;
  // Skip Firebase Auth calls
  if (event.request.url.includes('identitytoolkit.googleapis.com')) return;
  if (event.request.url.includes('securetoken.googleapis.com')) return;

  // Cache-First for immutable CDN assets (faster load, works offline)
  const isCDN = event.request.url.includes('unpkg.com') ||
                event.request.url.includes('cdn.jsdelivr.net') ||
                event.request.url.includes('cdnjs.cloudflare.com');

  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
        if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-First for all other GET requests (HTML, JS, CSS, etc.)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Try exact URL match first
        let cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        // Strip cache-busting query params (?v=...&sync=...) and retry
        const url = new URL(event.request.url);
        if (url.searchParams.has('v') || url.searchParams.has('sync')) {
          url.search = '';
          const cleanReq = new Request(url.toString(), event.request);
          cachedResponse = await caches.match(cleanReq);
          if (cachedResponse) return cachedResponse;
        }
        return new Response('Network error and not in cache', {
          status: 408,
          statusText: 'Network Timeout'
        });
      })
  );
});
