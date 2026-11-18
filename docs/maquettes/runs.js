import { shell, icon } from "./suivi.js";

// Fictional runs mirror the fields in the console's history response.
const runs = [
  ["18", "09:43:09", "Refus explicite", "Atlas", 1, 422, "Sans webhook"],
  ["18", "09:41:52", "Génération de document", "Studio", 2, 202, "Planifié"],
  [
    "18",
    "09:38:14",
    "Validation de ressource",
    "Atlas",
    1,
    400,
    "Sans webhook",
  ],
  ["18", "09:32:06", "Génération de document", "Studio", 2, 202, "Livré"],
  [
    "18",
    "09:28:47",
    "Acceptation sans référence",
    "Atlas",
    1,
    202,
    "Sans webhook",
  ],
  ["17", "16:54:23", "Génération de document", "Studio", 1, 202, "En échec"],
  ["17", "16:49:10", "Refus explicite", "Atlas", 1, 422, "Sans webhook"],
  [
    "17",
    "16:42:19",
    "Validation de ressource",
    "Atlas",
    1,
    400,
    "Sans webhook",
  ],
].map(([day, time, name, project, version, status, hook], id) => ({
  day,
  time,
  name,
  project,
  version,
  status,
  hook,
  id,
}));
const dayName = { 18: "Mercredi 18 novembre", 17: "Mardi 17 novembre" };
const journal = document.querySelector("#journal"),
  search = document.querySelector('[type="search"]');
const http = document.querySelector("#http"),
  hook = document.querySelector("#hook"),
  period = document.querySelector("#period");
let project = "";
shell("Exécutions", (value) => {
  project = value;
  render();
});
function fold(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
}
function row(r) {
  const tone = { Livré: "green", Planifié: "amber", "En échec": "red" }[r.hook];
  const contents = `<span class="call-time"><time>${r.time}</time></span><span class="identity"><strong>${r.name}</strong><small>${r.project} <span>·</span> v${r.version}</small></span>
    <span class="http ${r.status < 400 ? "ok" : "refusal"}"><b class="dot"></b>${r.status}</span>
    <span class="hook-state ${tone ? "" : "none"}">${tone ? `<b class="dot ${tone}"></b>` : ""}${r.hook}</span><span class="row-arrow">${icon("ChevronRight")}</span>`;
  return r.id === 0
    ? `<a class="run-row" href="trace.html" aria-label="Ouvrir la trace de ${r.name}, ${r.time}">${contents}</a>`
    : `<button class="run-row" data-run="${r.id}" aria-label="Consulter ${r.name}, ${r.time}">${contents}</button>`;
}
function render() {
  const rows = runs.filter(
    (r) =>
      (!project || r.project === project) &&
      (period.value === "all" || r.day === period.value) &&
      String(r.status).startsWith(http.value) &&
      (!hook.value || r.hook === hook.value) &&
      fold(r.name).includes(fold(search.value.trim())),
  );
  document.querySelector("#total").textContent =
    rows.length + " appel" + (rows.length > 1 ? "s" : "");
  journal.innerHTML = rows.length
    ? [...new Set(rows.map((r) => r.day))]
        .map(
          (day) => `
    <section class="day"><div class="day-head"><h3>${dayName[day]}</h3><span>Heure UTC</span></div>
    <div class="column-head" aria-hidden="true"><span>Heure</span><span>Simulation</span><span>HTTP</span><span>Webhook</span><span></span></div>
    ${rows
      .filter((r) => r.day === day)
      .map(row)
      .join("")}</section>`,
        )
        .join("")
    : `<div class="empty">${icon("Search")}<h3>Aucun appel trouvé</h3><button class="link-button" id="reset">Effacer les filtres</button></div>`;
  document.querySelector("#reset")?.addEventListener("click", () => {
    search.value =
      http.value =
      hook.value =
      project =
      document.querySelector("#project").value =
        "";
    period.value = "all";
    render();
    search.focus();
  });
}
journal.addEventListener("click", (e) => {
  const button = e.target.closest("[data-run]");
  if (!button) return;
  const r = runs[Number(button.dataset.run)],
    dialog = document.querySelector("#run-detail");
  dialog.setAttribute("aria-label", r.name);
  dialog.querySelector("h2").textContent = r.name;
  dialog.querySelector("dl").innerHTML = Object.entries({
    "Appel reçu": r.day + " nov. · " + r.time + " UTC",
    Projet: r.project,
    Version: "v" + r.version,
    "Réponse HTTP": r.status,
    Webhook: r.hook,
  })
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`)
    .join("");
  dialog.showModal();
});
search.oninput = render;
for (const el of [period, hook, http]) el.onchange = render;
render();
