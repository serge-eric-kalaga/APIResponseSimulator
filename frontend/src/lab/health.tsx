"use client";
import { Activity, CircleCheck, Settings2, Timer, Webhook } from "lucide-react";
import { utc } from "./client";
import type { Workspace } from "./client";
import s from "./monitoring.module.css";

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

export function Health({ ws }: { ws: Workspace }) {
  const active = ws.destinations.filter((d) => d.status === "active");
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
          <p className={s.empty}>Aucune URL de réception enregistrée.</p>
        )}
      </section>
    </div>
  );
}
