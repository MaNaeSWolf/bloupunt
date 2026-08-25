/* Bloupunt service worker — offline cold-launch support.
   Cache-first on the app shell so a launch with no network still loads.

   ┌──────────────────────────────────────────────────────────────────┐
   │ WHEN YOU CHANGE index.html: bump VERSION below (v1 -> v2 -> ...).  │
   │ That is what makes this file's bytes change, which is the only     │
   │ signal the browser uses to install the new worker and re-cache     │
   │ the updated shell. Forget it and phones keep serving the old page. │
   └──────────────────────────────────────────────────────────────────┘ */

const VERSION = 'bloupunt-v60';
const CORE = ['./', './index.html'];

/* cache:'reload' is load-bearing, not tidiness. cache.addAll() fetches through the
   BROWSER's HTTP cache, and GitHub Pages serves index.html with max-age=600. Deploy
   twice inside ten minutes and the new worker installs, re-fetches the shell, gets the
   PREVIOUS build back from the HTTP cache, and stores it under the new version's key.
   The worker then truthfully reports the new version while serving the old page - and
   because the fetch handler is cache-first, it keeps serving it until the next bump.
   That is exactly how v52 shipped a Journal card nobody could see. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => Promise.all(
      CORE.map(u => fetch(new Request(u, { cache: 'reload' })).then(res => {
        if (!res || !res.ok) throw new Error('precache failed: ' + u);
        return c.put(u, res);
      }))
    )).then(() => self.skipWaiting())
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
