// Mentor service worker: offline app shell, engine, content. Runtime cache, no auto-reload (a new version waits for the learner).
const VERSION = 'mentor-v2';
const ENGINE = ['engine/stockfish-19-lite-single.js', 'engine/stockfish-19-lite-single.wasm', 'content/puzzles/index.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(async (c) => {
      // the build writes precache.json: every file of the app (screens, engine, lessons data, puzzle shards)
      let list = ENGINE;
      try {
        const r = await fetch(new URL('precache.json', self.registration.scope), { cache: 'no-cache' });
        if (r.ok) list = [...(await r.json()), './'];
      } catch {
        /* fall back to the engine list; runtime caching fills the rest */
      }
      await Promise.allSettled(list.map((u) => c.add(new URL(u, self.registration.scope))));
    }),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (e) => {
  if (e.data?.type === 'skip-waiting') self.skipWaiting();
  if (e.data?.type === 'precache') {
    e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(e.data.urls.map((u) => c.add(u)))));
  }
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // never touch lichess/chess.com/groq
  const isNav = req.mode === 'navigate';
  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      if (isNav) {
        try {
          const fresh = await fetch(req);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (await cache.match(req, { ignoreVary: true })) || (await cache.match(new URL('./', self.registration.scope), { ignoreVary: true })) || Response.error();
        }
      }
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })(),
  );
});
