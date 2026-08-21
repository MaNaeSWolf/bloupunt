/* Bloupunt service worker — offline cold-launch support.
   Cache-first on the app shell so a launch with no network still loads.

   ┌──────────────────────────────────────────────────────────────────┐
   │ WHEN YOU CHANGE index.html: bump VERSION below (v1 -> v2 -> ...).  │
   │ That is what makes this file's bytes change, which is the only     │
   │ signal the browser uses to install the new worker and re-cache     │
   │ the updated shell. Forget it and phones keep serving the old page. │
   └──────────────────────────────────────────────────────────────────┘ */

const VERSION = 'bloupunt-v40';
const CORE = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Let the page ask which build is actually running, so the version shown in Manage
// is the worker's own truth rather than a number the page hopes is right.
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'version' && e.source) e.source.postMessage({ type:'version', version: VERSION });
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Sync must always hit the network. Never cache or serve stale API responses.
  if (req.url.indexOf('api.github.com') !== -1) return;

  // App shell: any navigation is served cache-first from index.html.
  // This is the whole point — a cold launch with no network still opens.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html').then(cached => cached || fetch(req)));
    return;
  }

  // Everything else (incl. the Google Fonts stylesheet + woff2): cache-first,
  // filling the cache on the first online hit so later offline launches keep them.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
