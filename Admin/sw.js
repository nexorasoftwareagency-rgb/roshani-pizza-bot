// Fail-fast if not on HTTPS (security best practice for Phase 2.20)
if (self.location.protocol !== 'https:' && self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
  throw new Error('Service Worker requires HTTPS');
}

// Firebase Messaging for background FCM handling
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDcx-SN5eak8PAs-8NtTGelJ_sICr5yb7Y",
  authDomain: "prashant-pizza-e86e4.firebaseapp.com",
  databaseURL: "https://prashant-pizza-e86e4-default-rtdb.firebaseio.com",
  projectId: "prashant-pizza-e86e4",
  messagingSenderId: "857471482885",
  appId: "1:857471482885:web:9eb8bbb90c77c588fbb06c"
});

const fcmMessaging = firebase.messaging();

fcmMessaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'New Order Alert';
  const notificationOptions = {
    body: payload.notification?.body || 'Open dashboard to view details.',
    icon: './icon-512.png',
    badge: './icon-512.png',
    data: { url: './index.html' }
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = 'roshani-erp-v4.9.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './mobile-overrides.css',
  './branding.js',
  './firebase-config.js',
  './receipt-templates.js',
  './js/init-appcheck.js',
  './manifest.json',
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
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.18/jspdf.plugin.autotable.min.js',
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
          if (response.ok) {
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
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        return new Response('Network error and not in cache', {
          status: 408,
          statusText: 'Network Timeout'
        });
      })
  );
});

// 4. Push Notification Event
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'New Alert', body: 'Check your dashboard.' };
  const options = {
    body: data.body,
    icon: './icon-erp.webp',
    badge: './icon-erp.webp',
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