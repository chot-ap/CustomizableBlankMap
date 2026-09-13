/**
 * sw.js
 * Service Worker for BlankMap Studio PWA (v3 - Network First for App Shell)
 */

const CACHE_NAME = 'blankmap-cache-v3';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/leaflet-custom.css',
  './js/app.js',
  './js/map.js',
  './js/store.js',
  './js/ui.js',
  './js/routing.js',
  './js/geocoding.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET') return;

  // Handle map tiles (Cache First with network fallback)
  if (url.hostname.includes('gsi.go.jp') || url.hostname.includes('openstreetmap.org') || url.hostname.includes('cartocdn.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          throw err;
        }
      })
    );
    return;
  }

  // Live APIs: Bypass cache
  if (url.hostname.includes('router.project-osrm.org') || url.hostname.includes('nominatim.openstreetmap.org') || url.hostname.includes('photon.komoot.io')) {
    return;
  }

  // App Shell & Local Assets: NETWORK FIRST so updates are immediately visible!
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
      }
      return networkResponse;
    }).catch(() => {
      // If offline or network fails, serve from cache
      return caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return caches.match('./index.html');
      });
    })
  );
});
