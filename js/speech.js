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

// Ein Abspieler für die ganze Seite. onProgress({status, abschnitt, gesamt, ki})
// status: "spielt" | "pause" | "ende" | "stopp" | "keine-stimme"; ki: gerade läuft eine Aufnahme
// audio: Verzeichnis der Aufnahmen {"<schluessel>-<n>": {datei}}; fehlt eine, liest die Gerätestimme.
// synth, doc und neuesAudio sind nur für Tests austauschbar.
export function createPlayer({ lexikon = {}, audio = {}, synth = globalThis.speechSynthesis, doc = globalThis.document,
  neuesAudio = () => new Audio() } = {}) {
  const stimmeDa = !!synth && typeof SpeechSynthesisUtterance !== "undefined";
  const available = stimmeDa || Object.keys(audio).length > 0;
  let aktuell = null;     // Referenz halten: sonst kann der Browser die Äußerung vor onend verwerfen
  let stuecke = [];       // [{art: "datei", src, text, abschnitt} | {art: "stimme", text, abschnitt}]
  let pos = 0, gesamt = 0, lauf = 0, status = "stopp";
  let melde = () => {};
  let wakeLock = null;
  let el = null, geladen = null;  // ein <audio> für alle Aufnahmen; geladen: dessen aktuelle Datei

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
  // Wieder sichtbar: Bildschirm wach halten und eine vom System beendete Wiedergabe fortsetzen
  function sichtbar() {
    if (status !== "spielt") return;
    wachHalten(true);
    const verstummt = stuecke[pos]?.art === "datei" ? el?.paused : !synth.speaking && !synth.pending;
    if (verstummt) sprich();
  }
  doc?.addEventListener("visibilitychange", () => { if (doc.visibilityState !== "hidden") sichtbar(); });

  function setze(s) {
    status = s;
    const stueck = stuecke[Math.min(pos, stuecke.length - 1)];
    melde({ status, abschnitt: (stueck?.abschnitt ?? 0) + 1, gesamt, ki: stueck?.art === "datei" });
  }

  function weiter(meinLauf) { if (meinLauf === lauf && status === "spielt") { pos++; sprich(); } }

  function alsStimme(abschnitt, text) {
    return chunkText(text).map(t => ({ art: "stimme", text: t, abschnitt }));
  }

  // Aufnahme nicht abspielbar: diesen Abschnitt stattdessen mit der Gerätestimme lesen
  function ersatz(meinLauf) {
    if (meinLauf !== lauf || status !== "spielt") return;
    const s = stuecke[pos];
    stuecke.splice(pos, 1, ...alsStimme(s.abschnitt, s.text));
    sprich();
  }

  function spieleDatei(s, meinLauf) {
    el ||= neuesAudio();
    if (geladen !== s.src) { el.src = s.src; geladen = s.src; }
    el.onended = () => weiter(meinLauf);
    el.onerror = () => ersatz(meinLauf);
    setze("spielt");
    // Ohne Tipp darf der Browser nicht starten: dann auf Pause, ein Tipp auf ▶ setzt fort
    Promise.resolve(el.play()).catch(e => {
      if (e?.name !== "NotAllowedError") ersatz(meinLauf);
      else if (meinLauf === lauf) { lauf++; setze("pause"); }
    });
  }

  function sprich() {
    const meinLauf = ++lauf;
    if (pos >= stuecke.length) { setze("ende"); wachHalten(false); return; }
    if (stuecke[pos].art === "datei") { spieleDatei(stuecke[pos], meinLauf); return; }
    if (!stimmeDa) { pos++; sprich(); return; }
    const u = new SpeechSynthesisUtterance(stuecke[pos].text);
    const stimme = waehleStimme(synth);
    if (stimme) { try { u.voice = stimme; } catch { /* nur in Tests: keine echte Stimme */ } }
    u.lang = stimme?.lang || "de-DE";
    u.rate = 0.95;
    u.onend = () => weiter(meinLauf);
    u.onerror = () => weiter(meinLauf);
    aktuell = u;
    synth.speak(u);
    setze("spielt");
  }

  // Hält Gerätestimme und Aufnahme an (eine Aufnahme behält ihre Position)
  function anhalten() { lauf++; if (stimmeDa) synth.cancel(); el?.pause(); }

  return {
    available,
    get _aktuell() { return aktuell; },
    _sichtbar: sichtbar,
    get status() { return status; },
    // schluessel: Name der Aufnahmen dieser Abschnitte, z. B. "ort-hain-kurz"
    play(abschnitte, onProgress, schluessel) {
      if (!available) { onProgress?.({ status: "keine-stimme", abschnitt: 0, gesamt: 0 }); return; }
      anhalten();
      geladen = null;  // neu beginnen, auch wenn dieselbe Aufnahme schon geladen war
      melde = onProgress || (() => {});
      stuecke = [];
      abschnitte.forEach((a, i) => {
        const text = toSpeechText([a.ueberschrift ? a.ueberschrift + "." : "", ...a.absaetze].join(" "), lexikon);
        const eintrag = schluessel && audio[`${schluessel}-${i + 1}`];
        if (eintrag) stuecke.push({ art: "datei", src: eintrag.datei, text, abschnitt: i });
        else stuecke.push(...alsStimme(i, text));
      });
      gesamt = abschnitte.length;
      pos = 0;
      if (stuecke.some(s => s.art === "stimme") && (!stimmeDa || (synth.getVoices().length && !waehleStimme(synth)))) {
        melde({ status: "keine-stimme", abschnitt: 0, gesamt });
      }
      wachHalten(true);
      sprich();
    },
    // Pause per Abbruch: zuverlässiger als synth.pause() auf Android
    pause() { if (status !== "spielt") return; anhalten(); setze("pause"); wachHalten(false); },
    resume() { if (status !== "pause") return; wachHalten(true); sprich(); },
    next() {
      if (status !== "spielt" && status !== "pause") return;
      const jetzt = stuecke[pos]?.abschnitt ?? 0;
      while (pos < stuecke.length && stuecke[pos].abschnitt === jetzt) pos++;
      anhalten();
      if (status === "spielt") sprich(); else setze("pause");
    },
    stop() { anhalten(); if (status !== "stopp") setze("stopp"); wachHalten(false); },
    // Anderes Verzeichnis der Aufnahmen (andere Stimme); gilt ab dem nächsten play()
    setAudio(neu) { audio = neu || {}; },
  };
}
