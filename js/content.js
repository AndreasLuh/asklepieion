// Laden und Prüfen der Inhalte (content/*.json).
const TERRASSEN = ["eingang", "unten", "mitte", "oben"];

export async function loadContent(base = "content/") {
  const hole = async name => {
    const r = await fetch(base + name);
    if (!r.ok) throw new Error(`${name} nicht ladbar (${r.status})`);
    return r.json();
  };
  // Eine einzelne .json-Datei enthält alles (für Tests und Vorschau)
  if (base.endsWith(".json")) return hole("");
  const [site, orte, themen, lexikon, audio, audioAndreas] = await Promise.all([
    ...["site.json", "orte.json", "themen.json", "lexikon.json"].map(hole),
    hole("audio.json").catch(() => ({ abschnitte: {} })),  // Aufnahmen sind freiwillig
    hole("audio-andreas.json").catch(() => ({ abschnitte: {} })),  // zweite Stimme (ElevenLabs), umschaltbar
  ]);
  return { site, orte: orte.orte, themen: themen.themen, lexikon,
    audio: audio.abschnitte || {}, audioAndreas: audioAndreas.abschnitte || {} };
}

// Alle vorlesbaren Abschnitte mit ihrem Schlüssel für die Aufnahmen.
// Gleiche Aufzählung wie in tools/vertonen.ps1.
export function audioAbschnitte(inhalt) {
  const liste = [];
  const hinzu = (schluessel, abschnitte, titel = "") =>
    (abschnitte || []).forEach((a, i) => liste.push({ schluessel: `${schluessel}-${i + 1}`, titel: i === 0 ? titel : "", abschnitt: a }));
  hinzu("einfuehrung", inhalt.site?.einfuehrung);
  for (const o of inhalt.orte || []) { hinzu(`ort-${o.id}-kurz`, o.kurz, o.titel); hinzu(`ort-${o.id}-mehr`, o.mehr); }
  for (const t of inhalt.themen || []) hinzu(`thema-${t.id}`, t.abschnitte, t.titel);
  return liste;
}

// Kennung des Textes einer Aufnahme: ändert sich der Text, passt die Aufnahme nicht mehr.
export async function audioHash({ titel, abschnitt }) {
  const roh = [titel || "", abschnitt.ueberschrift || "", ...abschnitt.absaetze].join("\n");
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(roh)));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
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
    if (r.thema && !themenIds.has(r.thema)) m.push(`Rundgang: unbekanntes Thema ${r.thema} bei ${r.id}`);
  }
  pruefeAbschnitte(site.einfuehrung, "Einführung", m);
  return m;
}
