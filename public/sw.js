'use strict';

const CACHE_NAME = 'fishsmart-pro-v2.20';
const STATIC_ASSETS = [
  '/manifest.json',
  '/icon.png',
  '/icon-512-maskable.png',
  '/44x44.png',
  '/apple-icon-180.png',
  '/manifest-icon-192.png',
  '/manifest-icon-192.maskable.png',
  '/manifest-icon-512.png',
  '/manifest-icon-512.maskable.png',
  '/offline.html',
  '/css/tailwind.css',
  '/css/shared.css'
];

const STATIC_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isCacheFresh(response, maxAgeMs) {
  if (!response) return false;
  const dateHeader = response.headers.get('date');
  if (!dateHeader) return true;
  return (Date.now() - new Date(dateHeader).getTime()) < maxAgeMs;
}

// Install: pre-cache static assets individually so one failure doesn't abort the batch
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW v8] Pre-caching static assets');
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW v8] Failed to pre-cache', url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW v8] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Offline fallback helper
function offlineFallback() {
  return caches.match('/offline.html').then((resp) => {
    return resp || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  });
}

// Fetch strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // History API: Stale-While-Revalidate (serve cached, update in background)
  if (url.pathname.startsWith('/api/history')) {
    const cacheKey = new URL(request.url);
    cacheKey.search = '';
    const normalizedReq = new Request(cacheKey.toString());
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(normalizedReq).then((cached) => {
          const fetchPromise = fetch(request).then((response) => {
            if (response.ok) cache.put(normalizedReq, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // API routes: Network-Only (never cache live data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        // Race condition fix: self.navigator.onLine is unreliable in SW context
        // and can return stale false after SW reinstall/activate lifecycle events.
        // Always return a generic retry-safe message instead of guessing offline state.
        return new Response(
          JSON.stringify({
            error: 'Service temporarily unavailable. The server may be waking up. Please try again in a moment.',
            offline: false
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // HTML pages: Network-First with cache fallback
  if (request.headers.get('accept')?.includes('text/html') ||
      url.pathname === '/' ||
      url.pathname === '/index.html' ||
      url.pathname === '/offline.html') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cacheControl = response.headers.get('Cache-Control') || '';
            if (!/no-store/i.test(cacheControl)) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || offlineFallback()))
    );
    return;
  }

  // CDN resources: Cache-First with network fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached && isCacheFresh(cached, STATIC_MAX_AGE_MS)) {
          return cached;
        }
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached || offlineFallback());
      })
    );
    return;
  }

  // Static assets (icons, manifest): Cache-First with max-age check
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && isCacheFresh(cached, STATIC_MAX_AGE_MS)) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached || offlineFallback());
    })
  );
});
