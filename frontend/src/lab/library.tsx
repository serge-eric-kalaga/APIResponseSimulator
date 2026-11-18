"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Archive,
  CheckCircle2,
  Copy,
  Ellipsis,
  FileCode2,
  Link2,
  Plus,
  Search,
  SlidersHorizontal,
  Workflow,
  ListFilter,
} from "lucide-react";
import type { Item, Workspace } from "./client";
import { navigate, api, itemState, urlFor, utc } from "./client";

type Props = {
  ws: Workspace;
  refresh: () => Promise<void>;
  notify: (msg: string) => void;
  project: string;
  projectPage?: Workspace["projects"][number];
};
export function Library({ ws, refresh, notify, project, projectPage }: Props) {
  const [search, setSearch] = useState(""),
    [service, setService] = useState(""),
    [ownership, setOwnership] = useState(""),
    [status, setStatus] = useState(""),
    [menu, setMenu] = useState("");
  const scope = ws.items.filter((i) => !project || i.project === project);
  const rows = scope.filter(
    (i) =>
      (!ownership || (ownership === "member" ? !!i.writable : !i.writable)) &&
      (!service || i.draft.service === service) &&
      (!status || itemState(i) === status) &&
      [i.draft.name, ...i.draft.tags, i.draft.service, i.project]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  async function action(i: Item, act: string) {
    setMenu("");
    try {
      if (act === "url") {
        await navigator.clipboard.writeText(urlFor(i.id, i.activePath!));
        notify("URL active copiée.");
        return;
      }
      if (
        act === "archive" &&
        !window.confirm(
          "Archiver cette simulation et désactiver son URL ? Les traces resteront accessibles.",
        )
      )
        return;
      if (act === "duplicate" && !ws.user.projects.length) {
        navigate("#/projects");
        notify("Créez votre projet pour y dupliquer cette simulation.");
        return;
      }
      const result = await api<Item>("scenarios/" + i.id + "/" + act, {});
      await refresh();
      if (act === "duplicate") navigate("#/editor/" + result.id);
      else notify("Simulation archivée.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const active = scope.filter((i) => !i.archived && i.active).length;
  return (
    <>
      <header className="pageheading">
        <div>
          <div className="eyeline">ESPACE DE TRAVAIL</div>
          <h1>{projectPage?.name || "Bibliothèque"}</h1>
          <p>
            {projectPage
              ? projectPage.writable
                ? "Simulations du projet"
                : "Projet partagé en lecture"
              : "Configurez, publiez et rejouez vos simulations HTTP."}
          </p>
        </div>
        <div className="actions">
          {!!projectPage?.writable && (
            <a
              className="btn"
              href={"#/sharing/project/" + encodeURIComponent(project)}
            >
              Partager le projet
            </a>
          )}
          <a
            className="btn primary"
            href={
              !ws.user.projects.length
                ? "#/projects"
                : projectPage?.writable
                  ? "#/new/" + encodeURIComponent(project)
                  : "#/new"
            }
          >
            <Plus size={17} />{" "}
            {ws.user.projects.length
              ? "Nouvelle simulation"
              : "Créer un projet"}
          </a>
        </div>
      </header>
      <section className="stats" aria-label="Vue d’ensemble">
        {[
          { icon: FileCode2, title: "Simulations", value: scope.length },
          { icon: CheckCircle2, title: "Versions actives", value: active },
          {
            icon: Workflow,
            title: "Exécutions conservées",
            value: ws.runCounts
              .filter((r) => !project || r.project === project)
              .reduce((sum, r) => sum + r.total, 0),
          },
        ].map(({ icon: Icon, title, value }) => (
          <div key={title}>
            <span className="statIcon">
              <Icon size={19} />
            </span>
            <div>
              <span>{title}</span>
              <strong>{value.toString().padStart(2, "0")}</strong>
            </div>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="sectionTitle">
          <h2>Simulations</h2>
          <span className="count">{rows.length}</span>
        </div>
        <div className="tools">
          <label className="search">
            <Search size={16} />
            <input
              aria-label="Rechercher dans les simulations"
              placeholder="Rechercher un nom ou un tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {!projectPage && (
            <label className="selectTool">
              <select
                value={ownership}
                onChange={(e) => setOwnership(e.target.value)}
                aria-label="Accès aux simulations"
              >
                <option value="">Tous les accès</option>
                <option value="member">Mes projets</option>
                <option value="shared">Partagées avec moi</option>
              </select>
            </label>
          )}
          <label className="selectTool">
            <SlidersHorizontal size={15} />
            <select
              aria-label="Service simulé"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">Tous les services</option>
              {Array.from(
                new Set(scope.map((i) => i.draft.service).filter(Boolean)),
              ).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="selectTool">
            <ListFilter size={15} />
            <select
              aria-label="Statut de simulation"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              {["Active", "Brouillon", "Archivée"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="rows">
          {rows.length === 0 ? (
            <p className="empty">
              Aucune simulation ne correspond à cette sélection.
            </p>
          ) : (
            <>
              <div className="simrow tableHead">
                <span>Simulation / route</span>
                <span>Projet</span>
                <span>Statut</span>
                <span>Version</span>
                <span />
              </div>
              {rows.map((i) => (
                <div className="simrow" key={i.id}>
                  <a className="rowTitle" href={"#/editor/" + i.id}>
                    <span className="routeIcon">
                      <FileCode2 size={19} />
                    </span>
                    <span>
                      <strong>{i.draft.name || "Sans titre"}</strong>
                      <small>
                        <b>{i.draft.method}</b> {i.draft.path}
                      </small>
                      <small className="modified">
                        Modifiée le {utc(i.updated)}
                      </small>
                    </span>
                  </a>
                  <span className="projectCell">
                    {i.project}
                    {!i.writable && <small>Lecture partagée</small>}
                  </span>
                  <span>
                    <span
                      className={
                        "badge " +
                        (i.archived ? "grey" : i.active ? "green" : "amber")
                      }
                    >
                      {itemState(i)}
                    </span>
                  </span>
                  <code>{i.active ? "v" + i.active : "—"}</code>
                  <div className="rowMenu">
                    <button
                      className="iconBtn"
                      aria-label={"Actions pour " + i.draft.name}
                      aria-expanded={menu === i.id}
                      onClick={() => setMenu(menu === i.id ? "" : i.id)}
                    >
                      <Ellipsis size={18} />
                    </button>
                    {menu === i.id && (
                      <div
                        className="dropdown"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setMenu("");
                        }}
                      >
                        <a href={"#/editor/" + i.id}>
                          <ArrowUpRight />
                          Ouvrir
                        </a>
                        {i.activePath && (
                          <button onClick={() => action(i, "url")}>
                            <Link2 />
                            Copier l’URL
                          </button>
                        )}
                        <button onClick={() => action(i, "duplicate")}>
                          <Copy />
                          Dupliquer
                        </button>
                        {!!i.writable && (
                          <a href={"#/sharing/simulation/" + i.id}>Partager</a>
                        )}
                        {!!i.writable && !i.archived && (
                          <button onClick={() => action(i, "archive")}>
                            <Archive />
                            Archiver
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </section>
    </>
  );
}
