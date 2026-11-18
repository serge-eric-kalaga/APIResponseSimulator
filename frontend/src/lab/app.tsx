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
import { Library } from "./library";
import { Editor } from "./editor";
import { Health, History, RunDetail } from "./history";
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
              await api("login", { key });
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
            Ouvrir votre
            <br />
            espace de test.
          </h1>
          <p>
            Accédez à vos simulations HTTP, à leurs versions et aux traces de
            vos appels.
          </p>
          <label className="field">
            <span>Clé d’accès personnelle</span>
            <input
              autoComplete="current-password"
              required
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Saisissez votre clé d’accès"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn primary">
            {busy ? "Connexion…" : "Ouvrir la console"}
            <ArrowRight size={17} />
          </button>
          <small>
            La clé est fournie par l’administrateur de votre environnement.
          </small>
        </form>
        <div className="gateFoot">
          <CircleDot size={14} /> Environnement de recette
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
  const [, view, id] = route.split("/"),
    group = ["new", "editor"].includes(view) ? "library" : view;
  const item = ws.items.find((i) => i.id === id),
    activeLink = links.find((l) => l.id === group);
  return (
    <div className="lab">
      <a className="skip" href="#main">
        Aller au contenu
      </a>
      <aside className={"sidebar " + (mobile ? "show" : "")}>
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
            <Radio size={15} /> Environnement pilote
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
            aria-label="Ouvrir le menu"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <Command size={15} />
          <span>Console</span>
          <ChevronRight size={13} />
          <strong>{activeLink?.name || "Bibliothèque"}</strong>
          <span className="envTag">
            <i /> Recette
          </span>
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
        <main id="main" className="mainContent">
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
          {view === "new" || view === "editor" ? (
            view === "editor" && !item ? (
              <p>Simulation introuvable.</p>
            ) : (
              <Editor
                key={id || "new"}
                item={item}
                ws={ws}
                project={project}
                refresh={refresh}
                notify={notify}
              />
            )
          ) : view === "runs" ? (
            id ? (
              <RunDetail key={id} id={id} notify={notify} />
            ) : (
              <History
                rows={ws.runs.filter((r) => !project || r.project === project)}
              />
            )
          ) : view === "health" ? (
            <Health ws={ws} />
          ) : (
            <Library
              ws={ws}
              refresh={refresh}
              notify={notify}
              project={project}
            />
          )}
        </main>
      </div>
      {message && (
        <div className="toast" role="status">
          {message}
          <button
            aria-label="Fermer la notification"
            onClick={() => notify("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
