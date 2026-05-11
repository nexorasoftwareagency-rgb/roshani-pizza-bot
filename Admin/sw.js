// ROSHANI ERP SERVICE WORKER
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

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Background message received:', payload);
  const title = payload.notification.title || "New ERP Update";
  const options = {
    body: payload.notification.body || "Open your dashboard to see what's new.",
    icon: './icon-pizza.webp',
    badge: './icon-pizza.webp',
    data: { url: './index.html' }
  };
  self.registration.showNotification(title, options);
});

// Fail-fast if not on HTTPS
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
  // Only cache GET requests with HTTP/HTTPS schemes
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

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

// 5. Notification Click Event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || './index.html')
    );
  }
});