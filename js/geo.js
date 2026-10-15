// Lageplan: Umrechnung GPS → Plan-Pixel und Planansicht mit Standort.
const SVGNS = "http://www.w3.org/2000/svg";
const M_PRO_GRAD = 111195; // mittlerer Meter-Wert eines Breitengrads

// Lineares 3×3-Gleichungssystem lösen (Gauß mit Pivotsuche).
function loese3(A, b) {
  const M = A.map((z, i) => [...z, b[i]]);
  for (let s = 0; s < 3; s++) {
    let p = s;
    for (let z = s + 1; z < 3; z++) if (Math.abs(M[z][s]) > Math.abs(M[p][s])) p = z;
    [M[s], M[p]] = [M[p], M[s]];
    for (let z = 0; z < 3; z++) {
      if (z === s) continue;
      const f = M[z][s] / M[s][s];
      for (let k = s; k < 4; k++) M[z][k] -= f * M[s][k];
    }
  }
  return M.map((z, i) => z[3] / z[i]);
}

// Affine Abbildung (kleinste Quadrate) aus ≥3 Kontrollpunkten {lat, lon, x, y}.
export function makeProjection(kontrollpunkte, { breite, hoehe }) {
  const lat0 = kontrollpunkte.reduce((s, k) => s + k.lat, 0) / kontrollpunkte.length;
  const lon0 = kontrollpunkte.reduce((s, k) => s + k.lon, 0) / kontrollpunkte.length;
  const kx = M_PRO_GRAD * Math.cos(lat0 * Math.PI / 180);
  const lokal = (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * M_PRO_GRAD];

  const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], Atx = [0, 0, 0], Aty = [0, 0, 0];
  for (const k of kontrollpunkte) {
    const [e, n] = lokal(k.lat, k.lon);
    const z = [e, n, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) AtA[i][j] += z[i] * z[j];
      Atx[i] += z[i] * k.x; Aty[i] += z[i] * k.y;
    }
  }
  const [a, b, c] = loese3(AtA, Atx);
  const [d, f, g] = loese3(AtA, Aty);

  const projektion = (lat, lon) => {
    const [e, n] = lokal(lat, lon);
    const x = a * e + b * n + c, y = d * e + f * n + g;
    return { x, y, inside: x >= 0 && x <= breite && y >= 0 && y <= hoehe };
  };
  projektion.mitte = { lat: lat0, lon: lon0 };
  projektion.pixelProMeter = (Math.hypot(a, d) + Math.hypot(b, f)) / 2;
  return projektion;
}

export const metersPerPixel = projektion => 1 / projektion.pixelProMeter;

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R = 6371000;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function entfernungText(m) {
  return m < 1000 ? `ca. ${Math.round(m / 10) * 10} m` : `ca. ${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

let laufendeBeobachtung = null; // {geo, id}
let gewuenscht = false;          // Standort wurde in dieser Sitzung eingeschaltet

export function stopStandort() {
  if (laufendeBeobachtung) {
    laufendeBeobachtung.geo.clearWatch(laufendeBeobachtung.id);
    laufendeBeobachtung = null;
  }
}

// Planansicht. optionen.geolocation erlaubt im Test eine Attrappe.
export function renderPlan(site, orte, ctx, optionen = {}) {
  const geo = "geolocation" in optionen ? optionen.geolocation : navigator.geolocation;
  const { planBreite: B, planHoehe: H } = site;
  const projektion = makeProjection(site.kontrollpunkte, { breite: B, hoehe: H });

  const seite = document.createElement("section");
  seite.className = "seite plan";

  const kopf = document.createElement("div");
  kopf.className = "pad plan-kopf";
  const titel = document.createElement("h1");
  titel.textContent = "Lageplan";
  const hinweis = document.createElement("p");
  hinweis.className = "hinweis";
  hinweis.textContent = "Tippen Sie auf eine Nummer, um den Ort zu öffnen.";
  kopf.append(titel, hinweis);

  const rahmen = document.createElement("div");
  rahmen.className = "plan-rahmen";
  rahmen.style.aspectRatio = `${B} / ${H}`;
  const bild = document.createElement("img");
  bild.src = "img/plan.svg";
  bild.alt = "Lageplan des Asklepieions mit den drei Terrassen";
  const ebene = svg("svg", { viewBox: `0 0 ${B} ${H}`, class: "plan-ebene", role: "group", "aria-label": "Orte im Plan" });

  for (const o of orte) {
    const p = projektion(o.lat, o.lon);
    const a = svg("a", { href: `#/ort/${o.id}`, class: "marker" + (ctx.isSeen(o.id) ? " gesehen" : ""), "aria-label": `${o.nr}: ${o.titel}` });
    a.append(svg("circle", { cx: p.x, cy: p.y, r: 13 }));
    const t = svg("text", { x: p.x, y: p.y, "text-anchor": "middle", "dominant-baseline": "central" });
    t.textContent = String(o.nr);
    a.append(t);
    ebene.append(a);
  }
  const kreis = svg("circle", { class: "standort-kreis", cx: 0, cy: 0, r: 0 });
  const punkt = svg("circle", { class: "standort-punkt", cx: 0, cy: 0, r: 7 });
  kreis.setAttribute("visibility", "hidden");
  punkt.hidden = true; punkt.setAttribute("visibility", "hidden");
  ebene.append(kreis, punkt);
  rahmen.append(bild, ebene);

  const leiste = document.createElement("div");
  leiste.className = "pad standort";
  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "standort-knopf";
  knopf.textContent = "Standort anzeigen";
  const info = document.createElement("p");
  info.className = "standort-info hinweis";
  leiste.append(knopf, info);

  const zeigePunkt = sichtbar => {
    punkt.hidden = !sichtbar;
    punkt.setAttribute("visibility", sichtbar ? "visible" : "hidden");
    kreis.setAttribute("visibility", sichtbar ? "visible" : "hidden");
  };

  knopf.addEventListener("click", () => {
    if (!geo) { info.textContent = "Dieses Gerät bietet keine Standortbestimmung an."; return; }
    stopStandort();
    gewuenscht = true;
    info.textContent = "Standort wird bestimmt …";
    const id = geo.watchPosition(pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      const p = projektion(latitude, longitude);
      if (!p.inside) {
        zeigePunkt(false);
        const m = distanceMeters(latitude, longitude, projektion.mitte.lat, projektion.mitte.lon);
        info.textContent = `Sie sind außerhalb der Anlage (${entfernungText(m)} entfernt).`;
        return;
      }
      for (const el of [punkt, kreis]) { el.setAttribute("cx", p.x); el.setAttribute("cy", p.y); }
      kreis.setAttribute("r", accuracy / metersPerPixel(projektion));
      zeigePunkt(true);
      info.textContent = `Ihr Standort (Genauigkeit ca. ${Math.round(accuracy)} m)`;
    }, fehler => {
      zeigePunkt(false);
      if (fehler.code === 1) gewuenscht = false;
      info.textContent = fehler.code === 1
        ? "Standort nicht freigegeben – der Plan funktioniert auch ohne."
        : "Standort derzeit nicht verfügbar – bitte später erneut versuchen.";
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    laufendeBeobachtung = { geo, id };
  });

  seite.append(kopf, rahmen, leiste);
  if (gewuenscht && geo && !("geolocation" in optionen)) setTimeout(() => knopf.click(), 0);
  return seite;
}
