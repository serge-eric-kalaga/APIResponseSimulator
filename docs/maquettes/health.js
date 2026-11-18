import { shell, icon } from "./suivi.js";

// Operator view for review only. Authorization changes live in memory until reload.
const targets = [
  {
    name: "Récepteur de recette",
    url: "https://recette.exemple.test/webhooks",
    projects: "Atlas · Studio",
    status: "active",
  },
  {
    name: "Documents Studio",
    url: "https://studio.exemple.test/documents",
    projects: "Studio",
    status: "active",
  },
  {
    name: "Collecteur Atlas",
    url: "https://atlas.exemple.test/notifications",
    projects: "Atlas",
    status: "pending",
  },
];
shell("Notifications");
const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(tab) {
  for (const t of tabs) {
    const active = t === tab;
    t.tabIndex = active ? 0 : -1;
    t.setAttribute("aria-selected", String(active));
    document.getElementById(t.getAttribute("aria-controls")).hidden = !active;
  }
}
tabs.forEach((t, i) => {
  t.onclick = () => select(t);
  t.onkeydown = (e) => {
    const index = { Home: 0, End: 1, ArrowLeft: 1 - i, ArrowRight: 1 - i }[
      e.key
    ];
    if (index === undefined) return;
    e.preventDefault();
    select(tabs[index]);
    tabs[index].focus();
  };
});
const allowed = document.querySelector("#allowed-panel"),
  review = document.querySelector("#review-panel");
function render() {
  const active = targets.filter((t) => t.status === "active"),
    pending = targets.filter((t) => t.status === "pending");
  document.querySelector("#pending").textContent = pending.length || "";
  allowed.innerHTML =
    active
      .map(
        (t) =>
          `<div class="destination"><span class="glyph">${icon("Webhook")}</span><div><strong>${t.name}</strong><code>${t.url}</code></div><small>${t.projects}</small><b class="method">POST</b></div>`,
      )
      .join("") || '<p class="empty">Aucune destination autorisée.</p>';
  const order = { pending: 0, active: 1, revoked: 2 };
  review.innerHTML = targets
    .map((t, id) => ({ t, id }))
    .sort((a, b) => order[a.t.status] - order[b.t.status])
    .map(
      ({ t, id }) =>
        `<div class="review-row"><div><strong>${t.name}</strong><code>${t.url}</code><small>${t.projects} · ${{ pending: "En attente", active: "Autorisée", revoked: "Révoquée" }[t.status]}</small></div><div class="row-actions">${t.status !== "active" ? `<button data-id="${id}" data-status="active">Autoriser</button>` : ""}${t.status !== "revoked" ? `<button data-id="${id}" data-status="revoked">Retirer</button>` : ""}</div></div>`,
    )
    .join("");
}
const dialog = document.querySelector("#confirm");
let selection;
review.onclick = (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b) return;
  selection = {
    target: targets[Number(b.dataset.id)],
    status: b.dataset.status,
  };
  const approve = selection.status === "active";
  const title = approve
    ? "Autoriser cette URL ?"
    : "Retirer cette autorisation ?";
  dialog.setAttribute("aria-label", title);
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("p").textContent = approve
    ? "Confirmez que cette URL appartient à un service de recette autorisé."
    : "Les notifications vers cette URL seront bloquées.";
  dialog.querySelector("code").textContent = selection.target.url;
  document.querySelector("#apply").textContent = approve
    ? "Autoriser"
    : "Retirer";
  dialog.showModal();
};
document.querySelector("#cancel").onclick = () => dialog.close();
document.querySelector("#apply").onclick = () => {
  selection.target.status = selection.status;
  dialog.close();
  render();
  tabs[1].focus();
  document.querySelector("#notice").textContent =
    selection.status === "active"
      ? "URL autorisée dans la maquette."
      : "Autorisation retirée dans la maquette.";
};
select(tabs[0]);
render();
