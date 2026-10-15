// Baut die Ansichten als DOM-Elemente. Inhalte werden nur als Text gesetzt.
const TERRASSE = {
  eingang: "Eingangsbereich",
  unten: "Untere Terrasse",
  mitte: "Mittlere Terrasse",
  oben: "Obere Terrasse",
};

function h(tag, attrs = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "hidden") el.hidden = true;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const k of kinder.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

// "Text mit *Betonung*" → Textknoten und <em>
function inline(text) {
  return String(text).split(/\*([^*]+)\*/).map((teil, i) => (i % 2 ? h("em", {}, teil) : teil));
}

function abschnitte(liste) {
  return h("div", { class: "text" }, (liste || []).map(a => [
    a.ueberschrift ? h("h2", {}, a.ueberschrift) : null,
    a.absaetze.map(p => h("p", {}, inline(p))),
  ]));
}

function audio(liste, ctx, beschriftung) {
  const box = h("div", { class: "audio" });
  const play = h("button", { class: "play", type: "button", "aria-label": beschriftung + " anhören" }, "▶");
  play.addEventListener("click", () => ctx.onSpeak(liste, box));
  box.append(play, h("span", { class: "audio-info" }, beschriftung + " anhören"));
  return box;
}

function quellen(liste) {
  return h("section", { class: "quellen" }, h("h2", {}, "Quellen"),
    h("ul", {}, (liste || []).map(q => h("li", {}, q))));
}

function figur(bild, art) {
  const eigene = bild.lizenz === "eigene Zeichnung";
  const nachweis = art !== "rekonstruktion"
    ? `${bild.alt}. Foto: ${bild.credit} · ${bild.lizenz}`
    : eigene
      ? `Schematische Rekonstruktion, ${bild.basis}. ${bild.credit}`
      : `Rekonstruktionsversuch: ${bild.credit}, ${bild.basis} · ${bild.lizenz}`;
  return h("figure", {},
    h("img", { src: bild.src, alt: bild.alt, loading: "lazy", decoding: "async" }),
    h("figcaption", {}, nachweis, bild.link ? [" · ", h("a", { href: bild.link, target: "_blank", rel: "noopener" }, "Quelle")] : null));
}

function bildflaeche(bilder) {
  const heute = bilder?.heute, rek = bilder?.rekonstruktion;
  if (!heute && !rek) return null;
  const flaeche = h("div", { class: "bildflaeche" });
  if (heute && rek) {
    const fHeute = figur(heute, "heute"), fRek = figur(rek, "rekonstruktion");
    fRek.hidden = true;
    const bHeute = h("button", { type: "button", class: "an", "aria-pressed": "true" }, "Heute");
    const bRek = h("button", { type: "button", "aria-pressed": "false" }, "Rekonstruktion");
    const waehle = zeigeRek => {
      fHeute.hidden = zeigeRek; fRek.hidden = !zeigeRek;
      bHeute.classList.toggle("an", !zeigeRek); bRek.classList.toggle("an", zeigeRek);
      bHeute.setAttribute("aria-pressed", String(!zeigeRek)); bRek.setAttribute("aria-pressed", String(zeigeRek));
    };
    bHeute.addEventListener("click", () => waehle(false));
    bRek.addEventListener("click", () => waehle(true));
    flaeche.append(fHeute, fRek, h("div", { class: "umschalter", role: "group", "aria-label": "Bild wählen" }, bHeute, bRek));
  } else {
    flaeche.append(heute ? figur(heute, "heute") : figur(rek, "rekonstruktion"));
  }
  return flaeche;
}

function gesehenMarke(id, ctx) {
  return ctx.isSeen(id) ? h("span", { class: "marke" }, "✓ gesehen") : null;
}

export function renderOrt(ort, ctx) {
  const chips = (ort.themen || []).map(id => ctx.themenById.get(id)).filter(Boolean)
    .map(t => h("a", { class: "chip", href: `#/thema/${t.id}` }, t.titel));
  const mehr = ort.mehr && ort.mehr.length
    ? h("details", { class: "mehr" }, h("summary", {}, "Mehr lesen"),
        audio(ort.mehr, ctx, "Vertiefung"), abschnitte(ort.mehr))
    : null;
  return h("article", { class: "seite ort", "data-id": ort.id },
    bildflaeche(ort.bilder),
    h("div", { class: "pad" },
      h("p", { class: "kicker" }, `${TERRASSE[ort.terrasse]} · Station ${ort.nr}`),
      h("h1", {}, ort.titel),
      h("p", { class: "untertitel" }, ort.untertitel),
      gesehenMarke(ort.id, ctx),
      audio(ort.kurz, ctx, "Kurzfassung"),
      abschnitte(ort.kurz),
      mehr,
      chips.length ? h("div", { class: "chips" }, h("span", { class: "chips-titel" }, "Passende Themen"), chips) : null,
      quellen(ort.quellen)));
}

export function renderThema(thema, ctx) {
  const bild = thema.bild ? h("div", { class: "bildflaeche" }, figur(thema.bild, thema.bild.basis ? "rekonstruktion" : "heute")) : null;
  return h("article", { class: "seite thema", "data-id": thema.id },
    bild,
    h("div", { class: "pad" },
      h("p", { class: "kicker" }, "Thema"),
      h("h1", {}, thema.titel),
      h("p", { class: "untertitel" }, thema.untertitel),
      gesehenMarke(thema.id, ctx),
      audio(thema.abschnitte, ctx, "Thema"),
      abschnitte(thema.abschnitte),
      quellen(thema.quellen)));
}

export function formatMinuten(min) {
  const std = Math.floor(min / 60), rest = Math.round(min % 60);
  if (std === 0) return `ca. ${rest} Min.`;
  return rest ? `ca. ${std} Std. ${rest} Min.` : `ca. ${std} Std.`;
}

export function renderRundgang(site, orte, ctx) {
  const byId = new Map(orte.map(o => [o.id, o]));
  const schritte = (site.rundgang || []).filter(r => byId.has(r.id));
  const summe = schritte.reduce((s, r) => s + (r.minuten || 0), 0);
  return h("section", { class: "seite liste pad" },
    h("p", { class: "kicker" }, "Vorschlag"),
    h("h1", {}, "Rundgang von unten nach oben"),
    h("p", { class: "dauer" }, `Gesamtdauer ${formatMinuten(summe)} (Lesen bzw. Hören und Wege)`),
    h("p", { class: "hinweis" }, "Ein Angebot, keine Pflicht: Sie können jederzeit abweichen, Stationen auslassen oder über den Plan frei wählen."),
    h("ol", { class: "stationen" }, schritte.map(r => {
      const o = byId.get(r.id);
      return h("li", { class: ctx.isSeen(o.id) ? "gesehen" : null },
        h("a", { href: `#/ort/${o.id}` },
          h("span", { class: "nr" }, String(o.nr)),
          h("span", { class: "was" }, h("strong", {}, o.titel), h("small", {}, `${TERRASSE[o.terrasse]} · ${formatMinuten(r.minuten)}`)),
          ctx.isSeen(o.id) ? h("span", { class: "haken", "aria-label": "gesehen" }, "✓") : null),
        r.thema && ctx.themenById.has(r.thema)
          ? h("a", { class: "pause", href: `#/thema/${r.thema}` }, "Pause mit Thema: ", h("strong", {}, ctx.themenById.get(r.thema).titel))
          : null);
    })));
}

export function renderThemen(themen, ctx) {
  return h("section", { class: "seite liste pad" },
    h("p", { class: "kicker" }, "Jederzeit lesbar"),
    h("h1", {}, "Themen"),
    h("p", { class: "hinweis" }, "Hintergründe, die an keinen bestimmten Ort gebunden sind – gut für eine Pause im Schatten."),
    h("ul", { class: "themenliste" }, themen.map(t => h("li", { class: ctx.isSeen(t.id) ? "gesehen" : null },
      h("a", { href: `#/thema/${t.id}` },
        h("span", { class: "was" }, h("strong", {}, t.titel), h("small", {}, t.untertitel)),
        ctx.isSeen(t.id) ? h("span", { class: "haken", "aria-label": "gesehen" }, "✓") : null)))));
}

export function renderEinfuehrung(site, ctx) {
  return h("article", { class: "seite einfuehrung pad" },
    h("p", { class: "kicker" }, "Einführung"),
    h("h1", {}, site.titel),
    h("div", { class: "offline-box", id: "offline-box" }),
    audio(site.einfuehrung, ctx, "Einführung"),
    abschnitte(site.einfuehrung));
}
