// Version ea8c995197f0
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

// Audio wird (vor allem von Safari) in Teilen angefragt: "Range: bytes=0-1" usw.
// Aus dem Cache dann nur den gewünschten Teil mit Status 206 liefern, sonst spielt das iPhone nichts ab.
async function teilantwort(req, antwort) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (!m) return antwort;
  const daten = await antwort.arrayBuffer();
  const start = m[1] ? Number(m[1]) : Math.max(0, daten.byteLength - Number(m[2]));
  const ende = m[1] && m[2] ? Math.min(Number(m[2]), daten.byteLength - 1) : daten.byteLength - 1;
  if (start >= daten.byteLength || start > ende) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${daten.byteLength}` } });
  }
  return new Response(daten.slice(start, ende + 1), { status: 206, headers: {
    "Content-Type": antwort.headers.get("Content-Type") || "audio/mpeg",
    "Content-Range": `bytes ${start}-${ende}/${daten.byteLength}`,
    "Content-Length": String(ende - start + 1),
    "Accept-Ranges": "bytes",
  } });
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(NAME);
    const treffer = await cache.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" ? await cache.match("./") : undefined);
    if (treffer) return teilantwort(req, treffer);
    try { return await fetch(req); }
    catch { return new Response("Offline nicht verfügbar", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  })());
});
