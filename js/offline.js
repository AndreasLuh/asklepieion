// Offline-Betrieb: Service Worker anmelden und prüfen, ob alles gespeichert ist.

export async function offlineStatus(cacheStorage, liste, version) {
  const gesamt = liste.length;
  try {
    const name = `asklepieion-${version}`;
    if (!cacheStorage || !(await cacheStorage.has(name))) return { fertig: 0, gesamt, bereit: false };
    const cache = await cacheStorage.open(name);
    let fertig = 0;
    for (const u of liste) if (await cache.match(u)) fertig++;
    return { fertig, gesamt, bereit: fertig === gesamt };
  } catch {
    return { fertig: 0, gesamt, bereit: false };
  }
}

export function statusText({ fertig, gesamt, bereit }) {
  return bereit ? "✓ Für offline bereit" : `${fertig} von ${gesamt} geladen – bitte im WLAN erneut öffnen`;
}

// Alle Dateien, auf die die Inhalte verweisen, müssen in der Precache-Liste stehen.
export function fehlendeImPrecache(inhalt, liste) {
  const noetig = new Set(["img/plan.svg"]);
  for (const o of inhalt.orte || []) {
    for (const b of [o.bilder?.heute, o.bilder?.rekonstruktion]) if (b?.src) noetig.add(b.src);
  }
  for (const t of inhalt.themen || []) if (t.bild?.src) noetig.add(t.bild.src);
  const vorhanden = new Set(liste);
  return [...noetig].filter(d => !vorhanden.has(d));
}

async function ladeListe() {
  const text = await (await fetch("precache-list.js", { cache: "no-store" })).text();
  const s = {};
  new Function("self", text)(s);
  return s;
}

// Meldet den Service Worker an und hält die Statusanzeigen aktuell.
// Auf localhost nur mit ?sw=1, damit die Entwicklung nicht aus dem Cache läuft.
export async function startOffline(anzeigen) {
  const zeige = text => anzeigen().forEach(el => { if (el) el.textContent = text; });
  const lokal = ["localhost", "127.0.0.1"].includes(location.hostname) && !new URLSearchParams(location.search).has("sw");
  if (!("serviceWorker" in navigator) || lokal) { zeige(lokal ? "" : "Offline-Speicherung wird von diesem Browser nicht unterstützt"); return; }
  try {
    await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    const { PRECACHE, CACHE_VERSION } = await ladeListe().catch(() => ({}));
    if (!PRECACHE) return;
    for (let i = 0; i < 60; i++) {
      const s = await offlineStatus(globalThis.caches, PRECACHE, CACHE_VERSION);
      zeige(statusText(s));
      if (s.bereit) return;
      await new Promise(r => setTimeout(r, 2000));
    }
  } catch {
    zeige("Offline-Speicherung nicht möglich – bitte Seite im WLAN neu laden");
  }
}
