"use client";
import { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, FolderPlus, Share2, Copy } from "lucide-react";
import { api } from "./client";
import type { Workspace } from "./client";

export function Projects({
  ws,
  refresh,
  notify,
}: {
  ws: Workspace;
  refresh: () => Promise<void>;
  notify: (m: string) => void;
}) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ name: string; key: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    setError("");
    setBusy(true);
    try {
      const result = await api<{ name: string; key: string }>("projects", {
        name,
      });
      setCreated(result);
      setName("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="pageheading">
        <div>
          <h1>Projets</h1>
          <p>Organisez vos simulations et gérez leur partage.</p>
        </div>
      </header>
      <div className="projectForms">
        <form
          className="panel block"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h2>
            <FolderPlus />
            Créer un projet
          </h2>
          <label className="field">
            Nom du projet
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button disabled={busy} className="btn primary">
            Créer le projet
          </button>
        </form>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {created && (
        <section className="panel block">
          <h2>Clé de déclenchement · {created.name}</h2>
          <p>
            Copiez cette clé pour appeler vos simulations depuis un client HTTP.
            Elle est affichée une seule fois.
          </p>
          <code className="wrap">{created.key}</code>
          <button
            className="btn small"
            onClick={() =>
              navigator.clipboard
                .writeText(created.key)
                .then(() => notify("Clé copiée."))
                .catch(() => notify("Copiez la clé affichée."))
            }
          >
            <Copy />
            Copier la clé
          </button>{" "}
          <button className="textBtn" onClick={() => setCreated(null)}>
            Masquer
          </button>
        </section>
      )}
      <section className="panel block">
        <h2>Projets accessibles</h2>
        {!ws.projects.length && (
          <p className="empty">
            Créez votre premier projet pour y ajouter des simulations.
          </p>
        )}
        {ws.projects.map((e) => (
          <div className="resourceRow" key={e.name}>
            <a href={"#/project/" + encodeURIComponent(e.name)}>
              <strong>{e.name}</strong>
              <small>{e.writable ? "Votre espace" : "Lecture partagée"}</small>
            </a>
            {!!e.writable && (
              <a
                className="textBtn"
                href={"#/sharing/project/" + encodeURIComponent(e.name)}
              >
                <Share2 size={15} />
                Partager
              </a>
            )}
            <a
              className="iconBtn"
              aria-label={"Ouvrir " + e.name}
              href={"#/project/" + encodeURIComponent(e.name)}
            >
              <ArrowRight size={16} />
            </a>
          </div>
        ))}
      </section>
    </>
  );
}
type Policy = { public: boolean; emails: string[] };
export function Sharing({
  kind,
  id,
  notify,
  refresh,
}: {
  kind: string;
  id: string;
  notify: (m: string) => void;
  refresh: () => Promise<void>;
}) {
  const [policy, set] = useState<Policy | null>(null),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const path = "sharing/" + kind + "/" + id;
  useEffect(() => {
    let live = true;
    api<Policy>(path)
      .then((v) => {
        if (live) set(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [path]);
  async function change(action: string, address = "") {
    setBusy(true);
    setError("");
    try {
      set(await api<Policy>(path, { action, email: address }));
      setEmail("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const back = kind === "simulation" ? "/editor/" + id : "/project/" + id;
  return (
    <>
      <a className="back" href={"#" + back}>
        <ArrowLeft size={15} />
        Retour
      </a>
      <header className="pageheading">
        <div>
          <h1>
            {kind === "simulation"
              ? "Partager la simulation"
              : "Partager le projet"}
          </h1>
          <p>
            {kind === "project"
              ? "Les simulations actuelles et futures de ce projet seront accessibles en lecture."
              : "Les destinataires pourront consulter la configuration et en créer une copie."}
          </p>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {policy && (
        <div className="panel block">
          <h2>Accès général</h2>
          <label className="field">
            Visibilité
            <select
              disabled={busy}
              value={policy.public ? "public" : "restricted"}
              onChange={(e) => change(e.target.value)}
            >
              <option value="restricted">
                Accès restreint aux membres et invités
              </option>
              <option value="public">
                Public pour tous les utilisateurs connectés
              </option>
            </select>
          </label>
          <button
            className="btn small"
            onClick={() =>
              navigator.clipboard
                .writeText(location.origin + location.pathname + "#" + back)
                .then(() => notify("Lien copié."))
                .catch(() => notify("Copie indisponible."))
            }
          >
            <Copy />
            Copier le lien
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void change("invite", email);
            }}
          >
            <h3>Partager avec un utilisateur</h3>
            <label className="field">
              Adresse e-mail du destinataire
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button disabled={busy} className="btn primary">
              Donner accès
            </button>
          </form>
          {policy.emails.map((v) => (
            <div className="resourceRow" key={v}>
              {v}
              <button
                disabled={busy}
                className="textBtn"
                onClick={() => change("remove", v)}
              >
                Retirer l’accès
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
