const CACHE_NAME = 'roshani-pizza-v1.51';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon-512.png'
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
    e.respondWith(
      caches.match(e.request).then((res) => res || fetch(e.request))
    );
  }
});
