// Laden und Prüfen der Inhalte (content/*.json).
const TERRASSEN = ["eingang", "unten", "mitte", "oben"];

export async function loadContent(base = "content/") {
  const hole = async name => {
    const r = await fetch(base + name);
    if (!r.ok) throw new Error(`${name} nicht ladbar (${r.status})`);
    return r.json();
  };
  const [site, orte, themen, lexikon] = await Promise.all(
    ["site.json", "orte.json", "themen.json", "lexikon.json"].map(hole));
  return { site, orte: orte.orte, themen: themen.themen, lexikon };
}

function pruefeAbschnitte(liste, wo, m) {
  if (!Array.isArray(liste)) { m.push(`${wo}: Abschnitte fehlen`); return; }
  liste.forEach((a, i) => {
    if (!Array.isArray(a.absaetze) || a.absaetze.length === 0) m.push(`${wo}: Abschnitt ${i + 1} ohne Absätze`);
  });
}

function pruefeBild(bild, wo, m, istRekonstruktion) {
  if (!bild) return;
  for (const feld of ["src", "alt", "credit", "lizenz"]) {
    if (!bild[feld]) m.push(`${wo}: Bild ohne ${feld}`);
  }
  if ((istRekonstruktion || bild.lizenz === "eigene Zeichnung") && !bild.basis) {
    m.push(`${wo}: Rekonstruktion ohne basis (Quelle der Zeichnung)`);
  }
}

function pruefeQuellen(q, wo, m) {
  if (!Array.isArray(q) || q.length === 0) m.push(`${wo}: keine Quelle angegeben`);
}

export function validateContent(c) {
  const m = [];
  const orte = c.orte || [], themen = c.themen || [], site = c.site || {};

  const ids = new Set();
  for (const x of [...orte, ...themen]) {
    if (!x.id) { m.push(`Eintrag ohne id: ${x.titel || "?"}`); continue; }
    if (ids.has(x.id)) m.push(`${x.id}: id doppelt vergeben`);
    ids.add(x.id);
  }
  const themenIds = new Set(themen.map(t => t.id));

  for (const o of orte) {
    const wo = `Ort ${o.id}`;
    if (!TERRASSEN.includes(o.terrasse)) m.push(`${wo}: terrasse ungültig (${o.terrasse})`);
    if (!o.titel) m.push(`${wo}: titel fehlt`);
    if (typeof o.lat !== "number" || typeof o.lon !== "number") m.push(`${wo}: Koordinaten fehlen`);
    pruefeAbschnitte(o.kurz, `${wo} (kurz)`, m);
    if (Array.isArray(o.kurz) && o.kurz.length === 0) m.push(`${wo}: Kurzfassung leer`);
    pruefeAbschnitte(o.mehr || [], `${wo} (mehr)`, m);
    for (const t of o.themen || []) if (!themenIds.has(t)) m.push(`${wo}: unbekanntes Thema ${t}`);
    pruefeBild(o.bilder?.heute, wo, m, false);
    pruefeBild(o.bilder?.rekonstruktion, wo, m, true);
    pruefeQuellen(o.quellen, wo, m);
  }

  for (const t of themen) {
    const wo = `Thema ${t.id}`;
    if (!t.titel) m.push(`${wo}: titel fehlt`);
    pruefeAbschnitte(t.abschnitte, wo, m);
    pruefeBild(t.bild, wo, m, false);
    pruefeQuellen(t.quellen, wo, m);
  }

  if (!Array.isArray(site.kontrollpunkte) || site.kontrollpunkte.length < 3) {
    m.push("Plan: mindestens 3 Kontrollpunkte nötig");
  }
  if (!site.planBreite || !site.planHoehe) m.push("Plan: planBreite/planHoehe fehlen");
  const ortIds = new Set(orte.map(o => o.id));
  for (const r of site.rundgang || []) {
    if (!ortIds.has(r.id)) m.push(`Rundgang: unbekannter Ort ${r.id}`);
  }
  pruefeAbschnitte(site.einfuehrung, "Einführung", m);
  return m;
}
