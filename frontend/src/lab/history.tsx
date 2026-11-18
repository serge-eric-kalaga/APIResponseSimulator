"use client";
import { Fragment, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Copy,
  Inbox,
  RefreshCw,
  Webhook,
} from "lucide-react";
import { api, pretty, stateName, utc } from "./client";
import type { Proof, Run } from "./client";

export function History({ rows }: { rows: Run[] }) {
  return (
    <>
      <header className="pageheading">
        <div>
          <div className="eyeline">OBSERVABILITÉ</div>
          <h1>Exécutions</h1>
          <p>
            Retrouvez les appels reçus et les preuves associées à chaque
            version.
          </p>
        </div>
      </header>
      <div className="panel">
        <div className="sectionTitle">
          <h2>Appels récents</h2>
          <span className="count">{rows.length}</span>
        </div>
        {!rows.length ? (
          <div className="empty">
            <Inbox />
            <p>Aucun appel reçu pour cette sélection.</p>
            <a className="textBtn" href="#/library">
              Ouvrir la bibliothèque
            </a>
          </div>
        ) : (
          rows.map((r) => (
            <a key={r.id} className="runrow" href={"#/runs/" + r.id}>
              <span className="routeIcon">
                <Activity size={17} />
              </span>
              <span>
                <strong>{r.name}</strong>
                <small>
                  {utc(r.received)} · {r.project} · v{r.version}
                </small>
              </span>
              <code>HTTP {r.status}</code>
              <span>{stateName(r.state)}</span>
              <ArrowUpRight size={16} />
            </a>
          ))
        )}
      </div>
    </>
  );
}
export function RunDetail({
  id,
  notify,
}: {
  id: string;
  notify: (v: string) => void;
}) {
  const [e, set] = useState<Proof | null>(null),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () =>
      api<Proof>("runs/" + id)
        .then((x) => {
          if (live) {
            set(x);
            setError("");
          }
        })
        .catch((err) => {
          if (live) setError(err.message);
        });
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id, tick]);
  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!e) return <p role="status">Chargement de l’exécution…</p>;
  const { trace: t, job: j, attempts } = e;
  const summary = () =>
    [
      "Recette · " + t.name,
      "Simulation " + e.sim + " · v" + e.version,
      "Corrélation " + e.id,
      utc(e.received),
      t.method + " " + t.path + " → HTTP " + t.status,
      "SHA testé : " + (t.sha || "non renseigné"),
      "Attendu : " + (t.expected || "non renseigné"),
      "Webhook : " + stateName(j?.state || null),
      location.href,
    ].join("\n");
  return (
    <>
      <a className="back" href="#/runs">
        <ArrowLeft size={15} />
        Exécutions
      </a>
      <header className="pageheading">
        <div>
          <div className="eyeline">TRACE D’EXÉCUTION · V{e.version}</div>
          <h1>{t.name}</h1>
          <p>
            {t.project} · {utc(e.received)}
          </p>
        </div>
        <button
          className="btn"
          onClick={() =>
            navigator.clipboard
              .writeText(summary())
              .then(() => notify("Résumé de recette copié."))
              .catch(() => notify("Copie indisponible."))
          }
        >
          <Copy />
          Copier le résumé
        </button>
      </header>
      <div className="editorLayout">
        <div className="stack">
          <section className="panel block">
            <h2>
              <Clock3 size={18} />
              Chronologie
            </h2>
            <ol className="timeline">
              <li>
                <strong>Appel reçu</strong>
                <small>
                  {utc(e.received)} · {t.method} {t.path}
                </small>
              </li>
              <li>
                <strong>Réponse préparée · HTTP {t.status}</strong>
                <small>Version v{e.version} enregistrée avec la trace.</small>
              </li>
              {j && (
                <li>
                  <strong>Webhook planifié · {j.dest}</strong>
                  <small>
                    {utc(j.planned)} · Délai prévu{" "}
                    {(j.planned - e.received) / 1000} s
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
                className="btn small"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Renvoyer le même webhook au récepteur de test avec sa clé d’idempotence initiale ?",
                    )
                  )
                    return;
                  try {
                    set(await api<Proof>("runs/" + id + "/replay", {}));
                  } catch (err) {
                    notify((err as Error).message);
                  }
                }}
              >
                Rejouer la notification
              </button>
            )}
            {j && ["pending", "retry"].includes(j.state) && (
              <button
                className="btn small"
                onClick={async () => {
                  try {
                    set(await api<Proof>("runs/" + id + "/cancel", {}));
                  } catch (err) {
                    notify((err as Error).message);
                  }
                }}
              >
                Annuler l’envoi
              </button>
            )}
          </section>
          <section className="panel block">
            <h2>
              <Activity size={18} />
              Données de la trace
            </h2>
            {[
              ["Variables résolues", t.variables],
              [
                "Appel entrant",
                { headers: t.requestHeaders, body: t.incoming },
              ],
              [
                "Réponse servie",
                { headers: t.responseHeaders, body: t.response },
              ],
              ...(j
                ? [
                    [
                      "Notification préparée",
                      { headers: t.hookHeaders, body: t.webhook },
                    ],
                  ]
                : []),
            ].map(([k, v]) => (
              <details key={String(k)}>
                <summary>{String(k)}</summary>
                <pre>{pretty(v)}</pre>
              </details>
            ))}
          </section>
        </div>
        <aside className="stack">
          <section className="panel block">
            <h2>
              <Check size={18} />
              Preuve de recette
            </h2>
            <dl className="facts">
              <dt>Corrélation</dt>
              <dd>
                <code>{e.id}</code>
              </dd>
              <dt>Simulation · version</dt>
              <dd>
                <a className="textBtn" href={"#/editor/" + e.sim}>
                  {e.sim} · v{e.version}
                </a>
              </dd>
              {j && (
                <>
                  <dt>Notification</dt>
                  <dd>
                    <code>{j.id}</code>
                  </dd>
                </>
              )}
              <dt>SHA testé</dt>
              <dd>{t.sha || "Non renseigné"}</dd>
              <dt>Résultat métier attendu</dt>
              <dd>{t.expected || "Non renseigné"}</dd>
            </dl>
            <button className="btn small" onClick={() => setTick((x) => x + 1)}>
              <RefreshCw />
              Actualiser la trace
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
export function Health({
  ws,
  refresh,
}: {
  ws: import("./client").Workspace;
  refresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function review(id: string, action: string, url: string) {
    if (
      action === "approve" &&
      !window.confirm(
        "Confirmez que cette URL appartient à un service de recette autorisé : " +
          url,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api("receivers/" + id, { action });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const activeDestinations = ws.destinations.filter(
    (d) => d.status === "active",
  );

  const h = ws.health,
    total = (h.delivered || 0) + (h.failed || 0);
  return (
    <>
      <header className="pageheading">
        <div>
          <div className="eyeline">ENVIRONNEMENT PILOTE</div>
          <h1>Notifications</h1>
          <p>
            Suivez le worker et les livraisons HTTP de vos projets autorisés.
          </p>
        </div>
      </header>
      <div className="stats">
        {[
          ["En attente", h.waiting || 0],
          ["Livrées", h.delivered || 0],
          ["En échec", h.failed || 0],
        ].map(([label, n]) => (
          <div key={label}>
            <span className="statIcon">
              <Webhook size={18} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{n}</strong>
            </div>
          </div>
        ))}
      </div>
      <section className="panel block">
        <h2>État technique</h2>
        <dl className="facts">
          <dt>Dernier signal du worker</dt>
          <dd>
            {h.heartbeat ? utc(h.heartbeat) : "Aucun signal"} ·{" "}
            {h.online ? "En ligne" : "À vérifier"}
          </dd>
          <dt>Erreurs de configuration de livraison</dt>
          <dd>{h.configErrors}</dd>
          <dt>Retard de la file</dt>
          <dd>{(h.lag / 1000).toFixed(1)} s</dd>
          <dt>Taux de livraison terminé</dt>
          <dd>
            {total
              ? Math.round((100 * (h.delivered || 0)) / total) + " %"
              : "Aucune livraison terminée"}
          </dd>
        </dl>
      </section>
      {ws.receiverReview.length > 0 && (
        <section className="panel block">
          <h2>Autorisations des URL de réception</h2>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {ws.receiverReview.map((r) => (
            <div key={r.id} className="envRow">
              <div>
                <strong className="wrap">{r.url}</strong>
                <small>
                  {r.project} · {r.environmentName} ·{" "}
                  {r.status === "pending"
                    ? "En attente"
                    : r.status === "active"
                      ? "Autorisée"
                      : "Révoquée"}
                </small>
              </div>
              {r.status !== "active" && (
                <button
                  className="btn small"
                  disabled={busy}
                  onClick={() => review(r.id, "approve", r.url)}
                >
                  Autoriser
                </button>
              )}
              {r.status !== "revoked" && (
                <button
                  className="textBtn"
                  disabled={busy}
                  onClick={() => review(r.id, "revoke", r.url)}
                >
                  Retirer
                </button>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="panel block">
        <h2>Destinations autorisées</h2>
        {activeDestinations.length ? (
          activeDestinations.map((d) => (
            <div key={d.id} className="dest">
              <span className="routeIcon">
                <Webhook size={16} />
              </span>
              <span>
                <strong>{d.label}</strong>
                <small>{d.projects.join(" · ")} · POST</small>
              </span>
            </div>
          ))
        ) : (
          <p>Aucune destination disponible.</p>
        )}
      </section>
    </>
  );
}
