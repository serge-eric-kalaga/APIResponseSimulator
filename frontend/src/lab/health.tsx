"use client";
import { useState } from "react";
import { Activity, CircleCheck, Settings2, Timer, Webhook } from "lucide-react";
import { api, utc } from "./client";
import type { Workspace } from "./client";
import { EditorDialog, EditorPanel, EditorTabs } from "./editor-controls";
import s from "./monitoring.module.css";

type Receiver = Workspace["receiverReview"][number];
type Decision = { receiver: Receiver; action: "approve" | "revoke" };
const statusLabel: Record<string, string> = {
  pending: "En attente",
  active: "Autorisée",
  revoked: "Révoquée",
};
const priority: Record<string, number> = { pending: 0, active: 1, revoked: 2 };
const seconds = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function DeliveryStatus({ health: h }: { health: Workspace["health"] }) {
  const delivered = h.delivered ?? 0,
    failed = h.failed ?? 0,
    total = delivered + failed;
  return (
    <>
      <section aria-labelledby="service-title">
        <div className={s.sectionHeading}>
          <h2 id="service-title">État technique</h2>
          <span className={s.context}>Tous les projets autorisés</span>
        </div>
        <div className={s.workerGrid}>
          <div className={s.worker}>
            <div className={s.workerTop}>
              <Activity size={17} />
              Worker de livraison
            </div>
            <strong>
              <b className={s.light} data-online={h.online} />
              {h.online ? "En ligne" : "À vérifier"}
            </strong>
            <div className={s.heartbeat}>
              <span>Dernier signal</span>
              {h.heartbeat ? (
                <time dateTime={new Date(h.heartbeat).toISOString()}>
                  {utc(h.heartbeat)}
                </time>
              ) : (
                <span>Aucun signal</span>
              )}
            </div>
          </div>
          <dl className={s.monitor}>
            <div>
              <dt>
                <Timer size={15} />
                Retard de la file
              </dt>
              <dd>
                {seconds.format(h.lag / 1000)} <small>s</small>
              </dd>
            </div>
            <div>
              <dt>
                <Settings2 size={15} />
                Erreurs de configuration
              </dt>
              <dd>{h.configErrors}</dd>
            </div>
            <div>
              <dt>
                <CircleCheck size={15} />
                Taux de livraison
                <small>
                  {total
                    ? `${total} envoi${total > 1 ? "s" : ""} terminé${total > 1 ? "s" : ""}`
                    : "Aucun envoi terminé"}
                </small>
              </dt>
              <dd>
                {total ? Math.round((100 * delivered) / total) + " %" : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </section>
      <section className={s.deliveries} aria-labelledby="deliveries-title">
        <div className={s.sectionHeading}>
          <h2 id="deliveries-title">Livraisons</h2>
        </div>
        <dl className={s.metrics}>
          {[
            { label: "En attente", value: h.waiting ?? 0, color: s.amber },
            { label: "Livrées", value: delivered, color: s.green },
            { label: "En échec", value: failed, color: s.red },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <dt>
                <b className={s.dot + " " + color} />
                {label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

export function Health({
  ws,
  refresh,
  notify,
}: {
  ws: Workspace;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [selected, setSelected] = useState<"allowed" | "review">("allowed");
  const [decision, setDecision] = useState<Decision | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = ws.destinations.filter((d) => d.status === "active");
  const review = ws.receiverReview.toSorted(
    (a, b) => priority[a.status] - priority[b.status],
  );
  const pending = review.filter((r) => r.status === "pending").length;
  const panel = ws.canReviewReceivers ? selected : "allowed";
  const approve = decision?.action === "approve";
  function confirm(receiver: Receiver, action: Decision["action"]) {
    setError("");
    setDecision({ receiver, action });
  }
  async function apply() {
    if (!decision || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("receivers/" + decision.receiver.id, {
        action: decision.action,
      });
      setDecision(null);
      await refresh();
      notify(approve ? "URL de réception autorisée." : "Autorisation retirée.");
      requestAnimationFrame(() =>
        document.getElementById("tab-review")?.focus(),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={s.page}>
      <header className={s.pageHead}>
        <h1>Notifications</h1>
      </header>
      <DeliveryStatus health={ws.health} />
      <section className={s.destinations} aria-labelledby="dest-title">
        <div className={s.sectionHeading}>
          <h2 id="dest-title">URL de réception</h2>
        </div>
        <EditorTabs
          label="URL de réception"
          tabs={[
            { id: "allowed" as const, label: "Destinations autorisées" },
            ...(ws.canReviewReceivers
              ? [
                  {
                    id: "review" as const,
                    label: (
                      <>
                        Autorisations
                        {pending > 0 && (
                          <span className={s.pending}>{pending}</span>
                        )}
                      </>
                    ),
                  },
                ]
              : []),
          ]}
          value={panel}
          select={setSelected}
        />
        <EditorPanel id="allowed" selected={panel}>
          {active.map((d) => (
            <div key={d.id} className={s.destination}>
              <span className={s.glyph}>
                <Webhook size={16} />
              </span>
              <div>
                <strong>
                  {d.label === d.url ? new URL(d.url).hostname : d.label}
                </strong>
                <code>{d.url}</code>
              </div>
              <small>{d.projects.join(" · ")}</small>
              <b className={s.method}>POST</b>
            </div>
          ))}
          {!active.length && (
            <p className={s.empty}>Aucune destination autorisée.</p>
          )}
        </EditorPanel>
        {ws.canReviewReceivers && (
          <EditorPanel id="review" selected={panel}>
            {review.map((r) => (
              <div className={s.reviewRow} key={r.id}>
                <div>
                  <strong>{new URL(r.url).hostname}</strong>
                  <code>{r.url}</code>
                  <small>
                    {r.project} · {statusLabel[r.status]}
                  </small>
                </div>
                <div className={s.rowActions}>
                  {r.status !== "active" && (
                    <button
                      disabled={busy}
                      onClick={() => confirm(r, "approve")}
                    >
                      Autoriser
                    </button>
                  )}
                  {r.status !== "revoked" && (
                    <button
                      disabled={busy}
                      onClick={() => confirm(r, "revoke")}
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!review.length && (
              <p className={s.empty}>Aucune URL à examiner.</p>
            )}
          </EditorPanel>
        )}
        {!decision && error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
      {decision && ws.canReviewReceivers && (
        <EditorDialog
          title={
            approve ? "Autoriser cette URL ?" : "Retirer cette autorisation ?"
          }
          close={() => {
            if (!busy) {
              setDecision(null);
              setError("");
            }
          }}
        >
          <p>
            {approve
              ? "Confirmez que cette URL appartient à un service de recette autorisé."
              : "Les notifications vers cette URL seront bloquées."}
          </p>
          <code className={s.confirmUrl}>{decision.receiver.url}</code>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className={s.actions}>
            <button
              disabled={busy}
              onClick={() => {
                setDecision(null);
                setError("");
              }}
            >
              Annuler
            </button>
            <button className={s.primary} disabled={busy} onClick={apply}>
              {approve ? "Autoriser" : "Retirer"}
            </button>
          </div>
        </EditorDialog>
      )}
    </div>
  );
}
