// Übersetzt den Hash der Adresse (#/ort/tempel-a) in Ansicht und ID.
const OHNE_ID = ["plan", "rundgang", "themen", "einfuehrung"];
const MIT_ID = ["ort", "thema"];
const START = { view: "einfuehrung", id: null };

export function parseRoute(hash) {
  const teile = (hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  const [view, id] = teile;
  if (OHNE_ID.includes(view) && teile.length === 1) return { view, id: null };
  if (MIT_ID.includes(view) && id && teile.length === 2) return { view, id: decodeURIComponent(id) };
  return { ...START };
}
