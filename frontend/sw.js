/**
 * Service Worker - PWA Offline Caching
 */
const CACHE_NAME = 'webreader-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/reader.html',
  '/css/tieuthuyetmang.css',
  '/manifest.json',
  '/plugins/themes/theme-engine.js',
  '/plugins/themes/tieuthuyetmang-dark.theme.json',
  '/plugins/themes/tieuthuyetmang-light.theme.json',
  '/plugins/themes/tieuthuyetmang-sepia.theme.json',
  '/plugins/themes/oled-pure-black.theme.json',
  '/js/navbar.js',
  '/js/home.js',
  '/js/reader.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Bỏ qua caching cho API calls và Range requests
  if (event.request.url.includes('/api/') || event.request.headers.get('range')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
