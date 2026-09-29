const CACHE_NAME = 'kegm-trafik-v1';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

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

self.addEventListener('fetch', (e) => {
  // JSON veri dosyalarını her zaman doğrudan ağdan taze çek, çekemezsen devam et
  if (e.request.url.includes('.json')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Statik varlıkları önbellekten hızlı ver
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

