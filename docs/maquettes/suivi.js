/** Shared chrome of the two review screens. Icons are bundled locally. */
export function icon(name) {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="suivi-icones.svg#${name}"></use></svg>`;
}
export function shell(page, onProject) {
  const links = [
    ["Projets", "Folder", "http://127.0.0.1:3210/#/projects"],
    ["Bibliothèque", "LibraryBig", "bibliotheque.html"],
    ["Exécutions", "Activity", "runs.html"],
    ["Notifications", "Webhook", "health.html"],
  ];
  const nav = links
    .map(
      ([label, glyph, href]) =>
        `<a href="${href}" ${page === label ? 'aria-current="page"' : ""}>${icon(glyph)}${label}</a>`,
    )
    .join("");
  document.body.insertAdjacentHTML(
    "afterbegin",
    `
    <a class="skip" href="#contenu">Aller au contenu</a>
    <div class="mobile-bar"><button id="toggle" aria-label="Ouvrir le menu" aria-controls="side" aria-expanded="false">${icon("Menu")}</button><span>Relais</span><span class="mobile-page">${page}</span></div>
    <aside class="side" id="side"><a class="brand" href="bibliotheque.html"><b>${icon("Layers2")}</b>Relais</a>
      ${onProject ? `<label class="scope">${icon("Folder")}<select id="project" aria-label="Projet"><option value="">Tous les projets</option><option>Atlas</option><option>Studio</option></select>${icon("ChevronDown")}</label>` : `<div class="scope scope-summary">${icon("Folder")}Tous les projets</div>`}
      <nav aria-label="Navigation principale">${nav}</nav>
    </aside><button class="scrim" id="scrim" aria-label="Fermer le menu" hidden></button>`,
  );
  document
    .querySelectorAll("[data-icon]")
    .forEach((el) => (el.outerHTML = icon(el.dataset.icon)));
  document
    .querySelector("#project")
    ?.addEventListener("change", (e) => onProject(e.target.value));
  const toggle = document.querySelector("#toggle"),
    side = document.querySelector("#side"),
    scrim = document.querySelector("#scrim");
  function menu(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute(
      "aria-label",
      open ? "Fermer le menu" : "Ouvrir le menu",
    );
    side.classList.toggle("open", open);
    scrim.hidden = !open;
    if (open) side.querySelector('[aria-current="page"]').focus();
    else if (matchMedia("(max-width:820px)").matches) toggle.focus();
  }
  toggle.onclick = () => menu(toggle.getAttribute("aria-expanded") === "false");
  scrim.onclick = () => menu(false);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !scrim.hidden) menu(false);
  });
  matchMedia("(max-width:820px)").addEventListener("change", () => {
    if (!scrim.hidden) menu(false);
  });
  document
    .querySelectorAll("dialog .close")
    .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
}
