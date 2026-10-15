import { parseRoute } from "./router.js";
import { loadContent } from "./content.js";
import { renderOrt, renderThema, renderRundgang, renderThemen, renderEinfuehrung } from "./render.js";

const ansicht = document.getElementById("ansicht");
// ?inhalt=../tests/fixtures/ erlaubt die Ansicht mit Testinhalten
const basis = new URLSearchParams(location.search).get("inhalt") || "content/";
let inhalt = null;
let ctx = null;

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
  ctx = {
    themenById: new Map(inhalt.themen.map(t => [t.id, t])),
    isSeen: () => false,
    onSpeak: () => {},
  };
  addEventListener("hashchange", zeigen);
  zeigen();
}

start();
