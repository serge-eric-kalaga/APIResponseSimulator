"use client";
import { useState } from "react";
import { Activity, ArrowUpRight, Inbox, Webhook } from "lucide-react";
import { api, stateName, utc } from "./client";
import type { Run } from "./client";

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
