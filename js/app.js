import { parseRoute } from "./router.js";

const ansicht = document.getElementById("ansicht");

function zeigen() {
  const route = parseRoute(location.hash);
  for (const a of document.querySelectorAll(".leiste a")) {
    a.classList.toggle("aktiv", a.dataset.view === route.view);
  }
  ansicht.innerHTML = "";
  const p = document.createElement("p");
  p.className = "pad";
  p.textContent = `Ansicht: ${route.view}${route.id ? " · " + route.id : ""}`;
  ansicht.append(p);
}

addEventListener("hashchange", zeigen);
zeigen();
