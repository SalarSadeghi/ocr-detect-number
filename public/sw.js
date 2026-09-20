// Production build injects every output file, including hashed JS/CSS and OCR.
const VERSION = '__BUILD_VERSION__';
const FILES = /* __PRECACHE_FILES__ */ [];
const ROOT = self.registration.scope;
const PREFIX = `number-scanner-offline:${ROOT}:`;
const CACHE = `${PREFIX}${VERSION}`;
const APP_URL = new URL('index.html', ROOT).href;
const ASSETS = new Set(FILES.map((file) => new URL(file, ROOT).href));

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Installation succeeds only when every required file is cached.
    await cache.addAll([...ASSETS].map((url) => new Request(url, { cache: 'reload' })));
  })());
  // Existing tabs finish on their current version before an update activates.
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.href.startsWith(ROOT)) return;
  if (request.mode !== 'navigate' && !ASSETS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request.mode === 'navigate' ? APP_URL : request);
    return cached || fetch(request);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data !== 'CHECK_OFFLINE_READY' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const keys = new Set((await cache.keys()).map((request) => request.url));
    event.ports[0].postMessage([...ASSETS].every((url) => keys.has(url)));
  })());
});

