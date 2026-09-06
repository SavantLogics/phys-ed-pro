/* PhysEd Pro v3.0 service worker.
   Strategy: stale-while-revalidate — serve from cache instantly
   (works offline, fast on slow school wifi), refresh the cache in
   the background so the next load picks up updates.
   https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API */
const CACHE_NAME = 'physed-pro-v3-2';
const ASSETS = ['./', './index.html', './logic.js', './storage.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
