// Merkt sich auf diesem Gerät, welche Orte und Themen schon gesehen wurden.
const SCHLUESSEL = "asklepieion.gesehen";

function lokalerSpeicher() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function createProgress(storage = lokalerSpeicher()) {
  let gesehen = new Set();
  try {
    const roh = storage?.getItem(SCHLUESSEL);
    const liste = roh ? JSON.parse(roh) : [];
    if (Array.isArray(liste)) gesehen = new Set(liste.filter(x => typeof x === "string"));
  } catch { /* kein Speicher oder kaputte Daten: leer beginnen */ }

  const sichern = () => {
    try { storage?.setItem(SCHLUESSEL, JSON.stringify([...gesehen])); } catch { /* nur im Arbeitsspeicher */ }
  };

  return {
    markSeen(id) { if (!gesehen.has(id)) { gesehen.add(id); sichern(); } },
    isSeen: id => gesehen.has(id),
    seenIds: () => [...gesehen],
    reset() { gesehen.clear(); try { storage?.removeItem(SCHLUESSEL); } catch { /* egal */ } },
  };
}
