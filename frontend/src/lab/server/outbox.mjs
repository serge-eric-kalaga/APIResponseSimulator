import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { Problem, transaction } from "./db.mjs";
import { execution } from "./scenarios.mjs";
import { entriesFor } from "./receivers.mjs";
import { target } from "./targets.mjs";
const MAX_TRIES = 3,
  LEASE_MS = 30000;

export function claim(db, now = Date.now()) {
  return transaction(db, () => {
    const row = db
      .prepare(
        `SELECT j.*,s.project,json_extract(v.config,'$.environment') env,coalesce(rp.after_attempt,0) offset FROM jobs j LEFT JOIN replays rp ON rp.job=j.id JOIN runs r ON r.id=j.run JOIN sims s ON s.id=r.sim JOIN versions v ON v.sim=r.sim AND v.number=r.version
      WHERE (j.state IN ('pending','retry') AND j.due<=?) OR (j.state='sending' AND j.until<=?) ORDER BY j.due LIMIT 1`,
      )
      .get(now, now);
    if (!row) return null;
    if (row.state === "sending") {
      db.prepare(
        "UPDATE attempts SET finished=?,outcome='Résultat inconnu après interruption' WHERE job=? AND number=?",
      ).run(now, row.id, row.count);
      if (row.count - row.offset >= MAX_TRIES) {
        db.prepare(
          "UPDATE jobs SET state='failed',lease=NULL,until=NULL WHERE id=?",
        ).run(row.id);
        return null;
      }
    }
    const lease = randomUUID(),
      count = row.count + 1;
    db.prepare(
      "UPDATE jobs SET state='sending',count=?,lease=?,until=? WHERE id=?",
    ).run(count, lease, now + LEASE_MS, row.id);
    db.prepare(
      "INSERT INTO attempts(job,number,started,outcome) VALUES(?,?,?,'Envoi en cours')",
    ).run(row.id, count, now);
    return { ...row, count, lease };
  });
}
export function finish(db, job, code, reason, temporary, now = Date.now()) {
  transaction(db, () => {
    const state =
      code >= 200 && code < 300
        ? "delivered"
        : temporary && job.count - job.offset < MAX_TRIES
          ? "retry"
          : "failed";
    const due =
      state === "retry"
        ? now + 1000 * (job.count - job.offset === 1 ? 5 : 30)
        : now;
    const changed = db
      .prepare(
        "UPDATE jobs SET state=?,due=?,lease=NULL,until=NULL WHERE id=? AND lease=?",
      )
      .run(state, due, job.id, job.lease);
    if (changed.changes)
      db.prepare(
        "UPDATE attempts SET finished=?,code=?,outcome=? WHERE job=? AND number=?",
      ).run(now, code, reason, job.id, job.count);
  });
}
export function cancel(db, user, id) {
  const { job } = execution(db, user, id);
  if (
    !job ||
    !db
      .prepare(
        "UPDATE jobs SET state='cancelled',due=? WHERE id=? AND state IN ('pending','retry')",
      )
      .run(Date.now(), job.id).changes
  )
    throw new Problem(409, "L’envoi a déjà commencé ou est terminé.");
}
/** Deliberate duplicate for QA: preserve the original outbox envelope and idempotency key. */
export function replayDelivery(db, user, id) {
  return transaction(db, () => {
    const { job } = execution(db, user, id);
    if (!job || job.state !== "delivered" || job.replayed)
      throw new Problem(
        409,
        "Seule une notification livrée peut être rejouée une fois.",
      );
    const now = Date.now();
    const { n } = db
      .prepare(
        "SELECT count(*) n FROM jobs WHERE state IN ('pending','retry','sending')",
      )
      .get();
    if (n >= 1000) throw new Problem(503, "File de notifications pleine.");
    db.prepare("INSERT INTO replays VALUES(?,?,?)").run(job.id, now, job.count);
    db.prepare("UPDATE jobs SET state='pending',due=? WHERE id=?").run(
      now,
      job.id,
    );
  });
}
/** Node's native client never follows redirects. Connect directly to the approved
 * address with the original Host and TLS servername, without a second DNS lookup. */
export function post(job, entry) {
  return new Promise((resolve, reject) => {
    const url = new URL(entry.url),
      secure = url.protocol === "https:";
    const headers = {
      ...JSON.parse(job.headers),
      "content-type": "application/json",
      "content-length": Buffer.byteLength(job.payload),
      host: url.host,
      "idempotency-key": job.id,
      "x-notification-id": job.id,
      "x-correlation-id": job.run,
    };
    if (entry.secretEnv) {
      const secret = process.env[entry.secretEnv];
      if (!secret) {
        reject(new Problem(422, "Secret de destination indisponible."));
        return;
      }
      headers.authorization = "Bearer " + secret;
    }
    const req = (secure ? https : http).request(
      {
        hostname: secure ? entry.ip : url.hostname,
        servername: url.hostname,
        port: url.port || (secure ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers,
        agent: false,
      },
      (res) => {
        resolve(res.statusCode);
        res.destroy();
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("timeout")), 5000);
    req.once("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(job.payload);
  });
}
export async function deliverOne(
  db,
  entries,
  transport = post,
  now = Date.now(),
) {
  const job = claim(db, now);
  if (!job) return false;
  let code = null,
    reason,
    temporary = false;
  try {
    const entry = target(
      job.dest,
      job.project,
      job.url,
      entries ?? entriesFor(db, job.project, job.env),
    );
    code = await transport(job, entry);
    temporary = [408, 425, 429].includes(code) || code >= 500;
    reason =
      code >= 200 && code < 300
        ? "Accusé de réception HTTP"
        : "Réponse HTTP " + code;
  } catch (error) {
    temporary = !(error instanceof Problem);
    reason = temporary
      ? "Échec réseau ou délai dépassé"
      : "Destination ou secret non autorisé";
  }
  finish(db, job, code, reason, temporary);
  return true;
}
export function maintain(db, now = Date.now()) {
  transaction(db, () => {
    db.prepare("INSERT OR REPLACE INTO worker_status VALUES(1,?)").run(now);
    db.prepare("DELETE FROM sessions WHERE expires<=?").run(now);
    db.prepare("DELETE FROM limits WHERE window<?").run(
      Math.floor(now / 60000) - 1,
    );
    db.prepare(
      `DELETE FROM runs WHERE received<? AND NOT EXISTS
      (SELECT 1 FROM jobs WHERE run=runs.id AND state IN ('pending','retry','sending'))`,
    ).run(now - 7 * 86400000);
  });
}
