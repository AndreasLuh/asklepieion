// Version e0919a4194e7
// Service Worker: speichert alle Dateien und liefert sie offline aus.
importScripts("precache-list.js");
const NAME = `asklepieion-${self.CACHE_VERSION}`;

self.addEventListener("install", event => {
  // cache: "reload" umgeht den HTTP-Cache, damit keine veralteten Dateien unter der neuen Version landen
  event.waitUntil(caches.open(NAME)
    .then(c => c.addAll(self.PRECACHE.map(u => new Request(u, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(namen => Promise.all(namen.filter(n => n.startsWith("asklepieion-") && n !== NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(NAME);
    const treffer = await cache.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" ? await cache.match("./") : undefined);
    if (treffer) return treffer;
    try { return await fetch(req); }
    catch { return new Response("Offline nicht verfügbar", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  })());
});
