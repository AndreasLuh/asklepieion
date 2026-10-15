// Vorlesen über die Sprachausgabe des Geräts (Web Speech API).

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Ersetzt Wörter nach Lexikon (Schreibung → Vorlesefassung), nur ganze Wörter.
export function toSpeechText(text, lexikon = {}) {
  const schluessel = Object.keys(lexikon).sort((a, b) => b.length - a.length);
  let t = String(text);
  if (schluessel.length) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${schluessel.map(escape).join("|")})(?![\\p{L}\\p{N}])`, "gu");
    t = t.replace(re, m => lexikon[m]);
  }
  return t.replace(/\*/g, "");
}

// Teilt Text in Stücke von höchstens max Zeichen, bevorzugt an Satzgrenzen.
export function chunkText(text, max = 220) {
  const saetze = String(text).replace(/\s+/g, " ").trim().match(/[^.!?;:]+(?:[.!?;:]+["»«“”)\]]*|$)/g) || [];
  const teile = [];
  for (let s of saetze.map(x => x.trim()).filter(Boolean)) {
    while (s.length > max) {
      let schnitt = s.lastIndexOf(" ", max);
      if (schnitt <= 0) schnitt = max;
      teile.push(s.slice(0, schnitt).trim());
      s = s.slice(schnitt).trim();
    }
    if (s) teile.push(s);
  }
  const stuecke = [];
  for (const t of teile) {
    const letztes = stuecke[stuecke.length - 1];
    if (letztes && letztes.length + 1 + t.length <= max && /[.!?;:]["»«“”)\]]*$/.test(letztes)) {
      stuecke[stuecke.length - 1] = letztes + " " + t;
    } else {
      stuecke.push(t);
    }
  }
  return stuecke;
}

function waehleStimme(synth) {
  const de = synth.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith("de"));
  return de.find(v => v.localService) || de[0] || null;
}

// Ein Abspieler für die ganze Seite. onProgress({status, abschnitt, gesamt})
// status: "spielt" | "pause" | "ende" | "stopp" | "keine-stimme"
export function createPlayer({ lexikon = {} } = {}) {
  const synth = globalThis.speechSynthesis;
  const available = !!synth && typeof SpeechSynthesisUtterance !== "undefined";
  let stuecke = [];       // [{text, abschnitt}]
  let pos = 0, gesamt = 0, lauf = 0, status = "stopp";
  let melde = () => {};
  let wakeLock = null;

  async function wachHalten(an) {
    try {
      if (an && !wakeLock && navigator.wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!an && wakeLock) {
        await wakeLock.release(); wakeLock = null;
      }
    } catch { wakeLock = null; }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && status === "spielt") wachHalten(true);
  });

  function setze(s) {
    status = s;
    const abschnitt = stuecke[Math.min(pos, stuecke.length - 1)]?.abschnitt ?? 0;
    melde({ status, abschnitt: abschnitt + 1, gesamt });
  }

  function sprich() {
    const meinLauf = ++lauf;
    if (pos >= stuecke.length) { setze("ende"); wachHalten(false); return; }
    const u = new SpeechSynthesisUtterance(stuecke[pos].text);
    const stimme = waehleStimme(synth);
    if (stimme) u.voice = stimme;
    u.lang = stimme?.lang || "de-DE";
    u.rate = 0.95;
    u.onend = () => { if (meinLauf === lauf && status === "spielt") { pos++; sprich(); } };
    u.onerror = () => { if (meinLauf === lauf && status === "spielt") { pos++; sprich(); } };
    synth.speak(u);
    setze("spielt");
  }

  return {
    available,
    get status() { return status; },
    play(abschnitte, onProgress) {
      if (!available) { onProgress?.({ status: "keine-stimme", abschnitt: 0, gesamt: 0 }); return; }
      synth.cancel();
      melde = onProgress || (() => {});
      stuecke = [];
      abschnitte.forEach((a, i) => {
        const text = [a.ueberschrift ? a.ueberschrift + "." : "", ...a.absaetze].join(" ");
        for (const t of chunkText(toSpeechText(text, lexikon))) stuecke.push({ text: t, abschnitt: i });
      });
      gesamt = abschnitte.length;
      pos = 0;
      if (synth.getVoices().length && !waehleStimme(synth)) {
        melde({ status: "keine-stimme", abschnitt: 0, gesamt });
      }
      wachHalten(true);
      sprich();
    },
    // Pause per Abbruch: zuverlässiger als synth.pause() auf Android
    pause() { if (status !== "spielt") return; lauf++; synth.cancel(); setze("pause"); wachHalten(false); },
    resume() { if (status !== "pause") return; wachHalten(true); sprich(); },
    next() {
      if (status !== "spielt" && status !== "pause") return;
      const jetzt = stuecke[pos]?.abschnitt ?? 0;
      while (pos < stuecke.length && stuecke[pos].abschnitt === jetzt) pos++;
      lauf++; synth.cancel();
      if (status === "spielt") sprich(); else setze("pause");
    },
    stop() { lauf++; if (available) synth.cancel(); if (status !== "stopp") setze("stopp"); wachHalten(false); },
  };
}
