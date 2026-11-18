"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Command,
  Folder,
  Layers2,
  LibraryBig,
  LogOut,
  Menu,
  Radio,
  RefreshCw,
  Terminal,
  Webhook,
  X,
} from "lucide-react";
import { navigate, api, RequestError } from "./client";
import type { Workspace } from "./client";
import { Projects, Sharing } from "./projects";
import { Library } from "./library";
import { Editor } from "./editor";
import { Health, History } from "./history";
import { RunDetail } from "./run-detail";

function Brand() {
  return (
    <div className="brand">
      <span>
        <Layers2 size={23} strokeWidth={2.4} />
      </span>
      Relais<span className="brandSep">/</span>
      <small>Console</small>
    </div>
  );
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [mode, setMode] = useState<"login" | "register" | "migrate">("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [key, setKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="gate">
      <div className="gateLeft">
        <Brand />
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(mode, {
                email,
                password,
                ...(mode === "migrate" ? { key } : {}),
              });
              await onLogin();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="eyeline">
            <span className="tinyLine" /> BANC DE TEST API
          </div>
          <h1>
            {mode === "register"
              ? "Créer un compte"
              : mode === "migrate"
                ? "Récupérer mon compte"
                : "Ouvrir votre espace de test."}
          </h1>
          <p>
            {mode === "migrate"
              ? "Associez votre ancienne clé à une adresse e-mail pour retrouver vos projets."
              : "Retrouvez vos projets et vos simulations HTTP dans votre espace."}
          </p>
          <label className="field">
            <span>Adresse e-mail</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "login" ? 1 : 10}
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode !== "login" && <small>10 caractères minimum.</small>}
          </label>
          {mode === "migrate" && (
            <label className="field">
              <span>Ancienne clé d’accès</span>
              <input
                type="password"
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn primary">
            {busy
              ? "Un instant…"
              : mode === "register"
                ? "Créer mon compte"
                : mode === "migrate"
                  ? "Associer mon compte"
                  : "Se connecter"}
            <ArrowRight size={17} />
          </button>
          <div className="actions">
            {(["login", "register", "migrate"] as const)
              .filter((m) => m !== mode)
              .map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busy}
                  className="textBtn"
                  onClick={() => {
                    setMode(m);
                    setError("");
                    setKey("");
                    setPassword("");
                  }}
                >
                  {m === "login"
                    ? "Se connecter"
                    : m === "register"
                      ? "Créer un compte"
                      : "J’ai une ancienne clé"}
                </button>
              ))}
          </div>
        </form>
        <div className="gateFoot">
          <CircleDot size={14} /> Console de recette
        </div>
      </div>
      <aside className="gateArt" aria-label="Exemple de fonctionnement">
        <div className="specimen">
          <div className="artTitle">
            <span>
              <Terminal size={16} /> Spécimen HTTP
            </span>
            <code>HTTP/1.1</code>
          </div>
          <div className="artPath">
            <span>POST</span>/v1/documents
          </div>
          <div className="wire">
            <i />
            <b>Réponse immédiate</b>
            <em>202 Accepted</em>
          </div>
          <pre>
            <span>{"{"}</span>
            {"\n  "}
            <b>&quot;reference&quot;</b>
            {": "}
            <i>&quot;doc_0842&quot;</i>
            {",\n  "}
            <b>&quot;etat&quot;</b>
            {": "}
            <i>&quot;pending&quot;</i>
            {"\n}"}
          </pre>
          <div className="artDelivery">
            <Webhook size={21} />
            <span>
              Notification différée<small>POST · T + 120 s</small>
            </span>
            <span className="dot" />
          </div>
        </div>
      </aside>
    </main>
  );
}
const links = [
  { id: "projects", name: "Projets", icon: Folder },
  { id: "library", name: "Bibliothèque", icon: LibraryBig },
  { id: "runs", name: "Exécutions", icon: Activity },
  { id: "health", name: "Notifications", icon: Webhook },
];
export function LabApp() {
  const [ws, setWs] = useState<Workspace | null>(null),
    [mode, setMode] = useState("load"),
    [route, setRoute] = useState("/library"),
    [project, setProject] = useState("");
  const [message, notify] = useState(""),
    [mobile, setMobile] = useState(false),
    [failure, setFailure] = useState("");
  const refresh = useCallback(async () => {
    try {
      setWs(await api<Workspace>("workspace"));
      setMode("ready");
      setFailure("");
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) {
        setWs(null);
        setMode("login");
      } else {
        setFailure((e as Error).message);
        throw e;
      }
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      void refresh().catch(() => {});
    });
    const navigate = () => {
      setRoute(location.hash.slice(1) || "/library");
      setMobile(false);
      window.scrollTo(0, 0);
    };
    queueMicrotask(navigate);
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, [refresh]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => notify(""), 4500);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (mode !== "ready" || (!route.startsWith("/runs") && route !== "/health"))
      return;
    const t = setInterval(() => {
      void refresh().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [route, mode, refresh]);
  useEffect(() => {
    if (mode !== "ready") return;
    function sync() {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    }
    function onNavigate() {
      if (/^#\/(library|project|editor|projects)(?:\/|$)/.test(location.hash))
        sync();
    }
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("hashchange", onNavigate);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("hashchange", onNavigate);
    };
  }, [mode, refresh]);
  if (mode === "login") return <Login onLogin={refresh} />;
  if (!ws)
    return (
      <main className="loading">
        <Brand />
        <p role="status">{failure || "Ouverture de la console…"}</p>
        {failure && (
          <button className="btn" onClick={() => refresh().catch(() => {})}>
            Réessayer
          </button>
        )}
      </main>
    );
  const [, view, id, resourceId] = route.split("/"),
    group = ["new", "editor"].includes(view)
      ? "library"
      : view === "project"
        ? "projects"
        : view;
  const selectedProject = ws.projects.find(
    (p) => encodeURIComponent(p.name) === id,
  );
  const item = ws.items.find((i) => i.id === id),
    activeLink = links.find((l) => l.id === group);
  const toast = message && (
    <div className="toast" role="status">
      {message}
      <button aria-label="Fermer la notification" onClick={() => notify("")}>
        <X size={15} />
      </button>
    </div>
  );
  return (
    <div
      className="lab"
      onKeyDown={(event) => {
        if (mobile && event.key === "Escape") {
          setMobile(false);
          document.getElementById("console-menu-toggle")?.focus();
        }
      }}
    >
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Aller au contenu
      </a>
      <aside
        id="console-sidebar"
        className={"sidebar " + (mobile ? "show" : "")}
      >
        <Brand />
        <button
          className="mobileClose iconBtn"
          aria-label="Fermer le menu"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <div className="sideLabel">ESPACE DE TRAVAIL</div>
        <label className="projectSwitch">
          <Folder size={16} />
          <select
            aria-label="Filtrer par projet"
            value={project}
            onChange={(e) => {
              setProject(e.target.value);
              navigate("#/library");
            }}
          >
            <option value="">Tous les projets</option>
            {ws.user.projects.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <nav aria-label="Navigation principale">
          {links.map(({ id, name, icon: Icon }) => (
            <a
              key={id}
              href={"#/" + id}
              aria-current={id === group ? "page" : undefined}
            >
              <Icon size={18} />
              {name}
            </a>
          ))}
        </nav>
        <div className="sidebarBottom">
          <div className="envSide">
            <Radio size={15} /> Console pilote
          </div>
          <div className="account">
            <b>{ws.user.name.slice(0, 2).toUpperCase()}</b>
            <span>
              {ws.user.name}
              <small>Accès personnel</small>
            </span>
            <button
              aria-label="Se déconnecter"
              onClick={async () => {
                try {
                  await api("logout", {});
                  setMode("login");
                  setWs(null);
                  setProject("");
                  setMobile(false);
                  notify("");
                  navigate("#/library");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="Masquer le menu"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="mainArea">
        <div className="topbar">
          <button
            className="mobileOpen iconBtn"
            id="console-menu-toggle"
            aria-expanded={mobile}
            aria-controls="console-sidebar"
            aria-label="Ouvrir le menu"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <span className="consoleCrumb">
            <Command size={15} /> Console <ChevronRight size={13} />
          </span>
          <strong>{activeLink?.name || "Bibliothèque"}</strong>
          {((view === "editor" && item) || selectedProject) && (
            <span className="projectTag">
              {item?.project || selectedProject?.name}
            </span>
          )}
          <button
            className="iconBtn"
            aria-label="Actualiser les données"
            onClick={() =>
              refresh()
                .then(() => notify("Données actualisées."))
                .catch((e) => notify(e.message))
            }
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <main
          id="main"
          tabIndex={-1}
          className={view === "runs" && id ? "traceContent" : "mainContent"}
        >
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
          {view === "projects" ||
          (view === "new" && !ws.user.projects.length) ? (
            <Projects ws={ws} refresh={refresh} notify={notify} />
          ) : view === "sharing" && !["simulation", "project"].includes(id) ? (
            <p>
              Ce lien de partage a expiré.{" "}
              <a className="textBtn" href="#/library">
                Ouvrir la bibliothèque
              </a>
            </p>
          ) : view === "sharing" ? (
            <Sharing
              key={route}
              kind={id}
              id={resourceId}
              refresh={refresh}
              notify={notify}
            />
          ) : view === "project" && !selectedProject ? (
            <p>Projet introuvable ou accès retiré.</p>
          ) : view === "new" || view === "editor" ? (
            view === "editor" && !item ? (
              <p>Simulation introuvable.</p>
            ) : (
              <Editor
                key={id || "new"}
                item={item}
                ws={ws}
                project={
                  view === "new" && selectedProject?.writable
                    ? selectedProject.name
                    : ws.user.projects.includes(project)
                      ? project
                      : ""
                }
                refresh={refresh}
                notify={notify}
              />
            )
          ) : view === "runs" && id ? (
            <RunDetail key={id} id={id} notify={notify} />
          ) : view === "runs" ? (
            <History
              rows={ws.runs.filter((r) => !project || r.project === project)}
            />
          ) : view === "health" ? (
            <Health ws={ws} refresh={refresh} />
          ) : (
            <Library
              ws={ws}
              refresh={refresh}
              notify={notify}
              project={view === "project" ? selectedProject!.name : project}
              projectPage={view === "project" ? selectedProject : undefined}
            />
          )}
        </main>
      </div>
      {toast}
    </div>
  );
}
