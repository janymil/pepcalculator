/* ==========================================================================
   PepCalculator service worker — hand-rolled, no build step, no dependencies.

   Goals, in order:
     1. Offline app shell: the calculator works with no network.
     2. Fresh when online: hashed assets are refreshed in the background.
     3. Never touch the sync server (or any other origin) — local-first, and a
        stale cached response would be worse than no response.

   This file lives in `public/`, so Vite copies it verbatim to the site root.
   Bump CACHE_VERSION whenever the shell list below changes.
   ========================================================================== */

const CACHE_VERSION = 'pepcalc-shell-v2';

/** Files that make the app render with no network at all. */
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  // The "How to use" tab frames this, so it has to work offline like the rest.
  '/explainer.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Added one by one: a single 404 must not abort the whole install.
      await Promise.all(
        SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

/** Network-first, falling back to the cached shell — used for page loads. */
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.status === 200) cache.put('/index.html', fresh.clone());
    return fresh;
  } catch {
    return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
  }
}

/** Stale-while-revalidate: instant from cache, updated in the background. */
async function handleAsset(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave the sync API alone

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  event.respondWith(handleAsset(request));
});

/**
 * The page hands over the actual reminder text (already localised), so the
 * service worker stays language-free.
 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
    return;
  }
  if (data.type === 'SHOW_DOSE_NOTIFICATION' && data.payload) {
    const { title, body, tag } = data.payload;
    void self.registration.showNotification(title, {
      body,
      tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      renotify: true,
    });
  }
});
