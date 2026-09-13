/**
 * sw.js
 * Service Worker for BlankMap Studio PWA
 * Handles caching and offline capability
 */

const CACHE_NAME = 'blankmap-cache-v2';


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

// Install: Cache local static shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean old caches
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

// Fetch: Smart caching strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Handle map tiles (Cache with Network First)
  if (url.hostname.includes('gsi.go.jp') || url.hostname.includes('openstreetmap.org') || url.hostname.includes('cartocdn.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          // If offline, serve from cache if available
          const cached = await cache.match(event.request);
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // Handle API requests (Photon / Nominatim / OSRM): Network only with graceful offline failure
  if (url.hostname.includes('router.project-osrm.org') || url.hostname.includes('nominatim.openstreetmap.org') || url.hostname.includes('photon.komoot.io')) {
    return; // Let browser fetch normally, client-side fallback handles offline
  }

  // For app shell and local assets: Cache First, fallback to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch update in background (Stale-while-revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
