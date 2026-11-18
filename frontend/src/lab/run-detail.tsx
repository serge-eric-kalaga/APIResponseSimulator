import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Copy, RefreshCw, Target } from "lucide-react";
import { api, stateName, utc } from "./client";
import type { Proof } from "./client";
import { TraceInspector } from "./trace-inspector";
import s from "./trace.module.css";

type Props = {
  id: string;
  notify: (message: string) => void;
};
type Action = "cancel" | "replay";

function Timeline({
  e,
  change,
  busy,
}: {
  e: Proof;
  change: (action: Action) => Promise<void>;
  busy: boolean;
}) {
  const { trace: t, job: j, attempts } = e;
  return (
    <section>
      <h2>Chronologie</h2>{" "}
      <ol className={s.events}>
        <li>
          <strong>Appel reçu</strong>
          <small>{new Date(e.received).toISOString().slice(11, 19)} UTC</small>
        </li>
        <li>
          <strong>Réponse préparée</strong>
          <small>
            HTTP {t.status} · Version {e.version}
          </small>
        </li>
        {j && (
          <li>
            <strong>Webhook planifié · {j.dest}</strong>
            <small>
              {utc(j.planned)} · Délai prévu {(j.planned - e.received) / 1000} s
            </small>
          </li>
        )}
        {attempts.map((a) => (
          <Fragment key={a.number}>
            <li>
              <strong>
                Tentative {a.number} · {a.outcome}
                {a.code && !a.outcome.includes(String(a.code))
                  ? " · HTTP " + a.code
                  : ""}
              </strong>
              <small>
                {utc(a.started)} · Délai observé{" "}
                {((a.started - e.received) / 1000).toFixed(1)} s
              </small>
            </li>
            {j?.replayed && j.after_attempt === a.number && (
              <li>
                <strong>Doublon de recette demandé</strong>
                <small>
                  {utc(j.replayed)} · Même identifiant de notification.
                </small>
              </li>
            )}
          </Fragment>
        ))}
        {j?.state === "cancelled" && (
          <li>
            <strong>Notification annulée</strong>
            <small>{utc(j.due)}</small>
          </li>
        )}
      </ol>
      {j && (
        <p>
          <span className="badge">{stateName(j.state)}</span>{" "}
          {j.state === "retry" && "Prochaine tentative le " + utc(j.due)}
        </p>
      )}
      {j?.state === "delivered" && !j.replayed && (
        <button
          className={s.tool}
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "Renvoyer le même webhook au récepteur de test avec sa clé d’idempotence initiale ?",
              )
            )
              void change("replay");
          }}
        >
          Rejouer la notification
        </button>
      )}
      {j && ["pending", "retry"].includes(j.state) && (
        <button
          className={s.tool}
          disabled={busy}
          onClick={() => void change("cancel")}
        >
          Annuler l’envoi
        </button>
      )}
    </section>
  );
}

export function RunDetail({ id, notify }: Props) {
  const [e, set] = useState<Proof | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  // Ignore reads overtaken by a manual refresh or a webhook mutation.
  const load = useCallback(
    async (manual = false) => {
      const request = ++generation.current;
      try {
        const next = await api<Proof>("runs/" + id);
        if (request !== generation.current) return;
        set(next);
        setError("");
        if (manual) notify("Trace actualisée.");
      } catch (err) {
        if (request === generation.current) {
          setError((err as Error).message);
          set(null);
        }
      }
    },
    [id, notify],
  );
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    let stopped = false;
    // Schedule the next poll after completion so a slow connection can still render a trace.
    async function poll() {
      await load();
      if (!stopped) timer = setTimeout(poll, 3000);
    }
    let timer = setTimeout(poll, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
      invalidate();
    };
  }, [load, invalidate]);
  async function change(action: Action) {
    setBusy(true);
    try {
      const updated = await api<Proof>("runs/" + id + "/" + action, {});
      generation.current++;
      set(updated);
      setError("");
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("Copié dans le presse-papiers.");
    } catch {
      notify("Copie indisponible.");
    }
  }
  function copySummary(proof: Proof) {
    const t = proof.trace;
    void copy(
      [
        "Recette · " + t.name,
        "Simulation " + proof.sim + " · v" + proof.version,
        "Corrélation " + proof.id,
        utc(proof.received),
        t.method + " " + t.path + " → HTTP " + t.status,
        "SHA testé : " + (t.sha || "non renseigné"),
        "Attendu : " + (t.expected || "non renseigné"),
        "Webhook : " + stateName(proof.job?.state || null),
        location.href,
      ].join("\n"),
    );
  }
  return (
    <div className={s.screen}>
      <div className={s.page}>
        <div className={s.crumb}>
          <a href="#/runs">Exécutions</a>
          <ChevronRight />
          <span>Trace d’exécution</span>
        </div>
        {error ? (
          <div role="alert">
            {error}{" "}
            <button className={s.tool} onClick={() => void load(true)}>
              Réessayer
            </button>
          </div>
        ) : !e ? (
          <p role="status">Chargement de l’exécution…</p>
        ) : (
          <>
            <header className={s.hero}>
              <div
                className={s.status}
                data-family={Math.floor(e.trace.status / 100)}
              >
                <span>HTTP</span>
                <strong>{e.trace.status}</strong>
              </div>
              <div className={s.heading}>
                <h1>{e.trace.name}</h1>
                <div className={s.meta}>
                  <span className={s.method}>{e.trace.method}</span>
                  <code>{e.trace.path}</code>
                  <span className={s.sep}>·</span>
                  <time dateTime={new Date(e.received).toISOString()}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(e.received)}{" "}
                    · {new Date(e.received).toISOString().slice(11, 19)} UTC
                  </time>
                </div>
              </div>
              <div className={s.actions}>
                <button
                  className={s.tool + " " + s.dark}
                  onClick={() => copySummary(e)}
                >
                  <Copy />
                  Copier le résumé
                </button>
                <button
                  className={s.tool}
                  aria-label="Actualiser la trace"
                  title="Actualiser la trace"
                  onClick={() => void load(true)}
                >
                  <RefreshCw />
                </button>
              </div>
            </header>
            <div className={s.columns}>
              <section className={s.maincol}>
                <TraceInspector proof={e} copy={copy} />
                <section className={s.goal}>
                  <Target />
                  <div>
                    <h3>Résultat métier attendu</h3>
                    <p>{e.trace.expected || "Non renseigné"}</p>
                  </div>
                </section>
              </section>
              <aside>
                <Timeline e={e} change={change} busy={busy} />
                <section className={s.facts}>
                  <h2>Références</h2>
                  <dl>
                    <dt>Projet</dt>
                    <dd>{e.trace.project}</dd>
                    <dt>Simulation</dt>
                    <dd>
                      <a href={"#/editor/" + e.sim} title={e.sim}>
                        {e.trace.name} ↗
                      </a>{" "}
                      · v{e.version}
                    </dd>
                    <dt>Corrélation</dt>
                    <dd>
                      <code>{e.id}</code>
                    </dd>
                    {e.job && (
                      <>
                        <dt>Notification</dt>
                        <dd>
                          <code>{e.job.id}</code>
                        </dd>
                      </>
                    )}
                    <dt>SHA testé</dt>
                    <dd>{e.trace.sha || "Non renseigné"}</dd>
                  </dl>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
