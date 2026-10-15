import { parseRoute } from "./router.js";
import { loadContent } from "./content.js";
import { createPlayer } from "./speech.js";
import { renderOrt, renderThema, renderRundgang, renderThemen, renderEinfuehrung } from "./render.js";

const ansicht = document.getElementById("ansicht");
// ?inhalt=../tests/fixtures/ erlaubt die Ansicht mit Testinhalten
const basis = new URLSearchParams(location.search).get("inhalt") || "content/";
let inhalt = null;
let ctx = null;
let player = null;
let aktiveBox = null;

function knopf(zeichen, label, klasse, onclick) {
  const b = document.createElement("button");
  b.type = "button"; b.className = klasse; b.textContent = zeichen;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onclick);
  return b;
}

// Steuert die Audioleiste (box) für die übergebenen Abschnitte.
function sprechen(abschnitte, box, beiEnde) {
  if (aktiveBox && aktiveBox !== box) aktiveBox.zuruecksetzen?.();
  aktiveBox = box;
  const ursprung = [...box.childNodes];
  const info = document.createElement("span");
  info.className = "audio-info";
  const pp = knopf("❚❚", "Pause", "play", () => (player.status === "spielt" ? player.pause() : player.resume()));
  const weiter = knopf("⏭", "Nächster Abschnitt", "weiter", () => player.next());
  box.zuruecksetzen = () => { box.replaceChildren(...ursprung); box.zuruecksetzen = null; };
  box.replaceChildren(pp, info, weiter);
  player.play(abschnitte, ({ status, abschnitt, gesamt }) => {
    if (status === "keine-stimme") { info.textContent = "Keine deutsche Vorlesestimme gefunden – siehe Einführung"; return; }
    if (status === "stopp") { box.zuruecksetzen?.(); return; }
    if (status === "ende") { box.zuruecksetzen?.(); beiEnde?.(); return; }
    pp.textContent = status === "spielt" ? "❚❚" : "▶";
    pp.setAttribute("aria-label", status === "spielt" ? "Pause" : "Weiter abspielen");
    info.textContent = `Abschnitt ${abschnitt}/${gesamt}`;
  });
}

function meldung(text) {
  const p = document.createElement("p");
  p.className = "pad hinweis";
  p.textContent = text;
  return p;
}

function zeigen() {
  const route = parseRoute(location.hash);
  for (const a of document.querySelectorAll(".leiste a")) {
    a.classList.toggle("aktiv", a.dataset.view === route.view || (route.view === "ort" && a.dataset.view === "plan") || (route.view === "thema" && a.dataset.view === "themen"));
  }
  let el;
  if (route.view === "ort") {
    const o = inhalt.orte.find(x => x.id === route.id);
    el = o ? renderOrt(o, ctx) : meldung("Diesen Ort gibt es nicht.");
  } else if (route.view === "thema") {
    const t = inhalt.themen.find(x => x.id === route.id);
    el = t ? renderThema(t, ctx) : meldung("Dieses Thema gibt es nicht.");
  } else if (route.view === "rundgang") el = renderRundgang(inhalt.site, inhalt.orte, ctx);
  else if (route.view === "themen") el = renderThemen(inhalt.themen, ctx);
  else if (route.view === "plan") el = meldung("Plan folgt.");
  else el = renderEinfuehrung(inhalt.site, ctx);
  ansicht.replaceChildren(el);
  scrollTo(0, 0);
}

async function start() {
  try {
    inhalt = await loadContent(basis);
  } catch (e) {
    ansicht.replaceChildren(meldung("Inhalte konnten nicht geladen werden: " + e.message));
    return;
  }
  player = createPlayer({ lexikon: inhalt.lexikon });
  ctx = {
    themenById: new Map(inhalt.themen.map(t => [t.id, t])),
    isSeen: () => false,
    onSpeak: sprechen,
  };
  addEventListener("hashchange", () => { player.stop(); zeigen(); });
  zeigen();
}

start();
