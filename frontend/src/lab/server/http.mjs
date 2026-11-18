import { ZodError } from "zod";
import { FieldError } from "../model.ts";
import { database, Problem, limit } from "./db.mjs";
import { enroll, passwordLogin } from "./passwords.mjs";
import { identity, signIn, hash } from "./access.mjs";
import { destinations, target } from "./targets.mjs";
import {
  activeConfig,
  duplicate,
  archive,
  execution,
  library,
  runs,
  save,
  scenario,
  trigger,
} from "./scenarios.mjs";
import {
  newProject,
  newEnvironment,
  environments,
  sharing,
} from "./workspaces.mjs";
import {
  registerReceiver,
  receiverList,
  reviewReceiver,
} from "./receivers.mjs";
import { cancel, replayDelivery } from "./outbox.mjs";

export async function readBody(req, max = 65536) {
  if (Number(req.headers.get("content-length")) > max)
    throw new Problem(413, "Corps trop volumineux.");
  if (!req.body) return "";
  const reader = req.body.getReader(),
    chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        throw new Problem(413, "Corps trop volumineux.");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.releaseLock();
  }
}
const common = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "content-security-policy": "sandbox; default-src 'none'",
  "referrer-policy": "no-referrer",
};
function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { ...common, ...headers } });
}
function errorResponse(error) {
  if (error instanceof ZodError)
    return json(
      {
        error: "Format du brouillon invalide.",
        field: error.issues[0]?.path[0],
      },
      422,
    );
  if (error instanceof FieldError)
    return json(
      { error: error.message, field: error.field, source: "relais" },
      422,
      { "x-lab-error": "1" },
    );
  if (error instanceof Problem)
    return json({ error: error.message, source: "relais" }, error.status, {
      "x-lab-error": "1",
    });
  console.error("Erreur interne Relais", error?.code || error?.name);
  return json(
    {
      error: "Le simulateur ne peut pas enregistrer cette opération.",
      source: "relais",
    },
    503,
    { "x-lab-error": "1" },
  );
}
export async function simulate(req, id, path, db) {
  try {
    db ??= database();
    const raw = await readBody(req);
    const r = trigger(db, {
      id,
      path,
      method: req.method,
      key: req.headers.get("x-lab-key"),
      sha: req.headers.get("x-tested-sha"),
      headers: Object.fromEntries(req.headers),
      raw,
    });
    return new Response(r.body, {
      status: r.status,
      headers: { ...r.headers, ...common },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
function technical(db, user) {
  const row = db
    .prepare(
      `SELECT sum(state='delivered') delivered,sum(state='failed') failed,
    sum(state IN ('pending','sending','retry')) waiting,min(CASE WHEN state IN ('pending','retry') THEN due END) due
    FROM jobs j JOIN runs r ON r.id=j.run JOIN sims s ON s.id=r.sim JOIN grants g ON g.project=s.project WHERE g.login=?`,
    )
    .get(user.name);
  const heartbeat =
    db.prepare("SELECT seen FROM worker_status WHERE id=1").get()?.seen || null;
  return {
    ...row,
    configErrors: db
      .prepare(
        `SELECT count(*) total FROM attempts a JOIN jobs j ON a.job=j.id JOIN runs r ON j.run=r.id
      JOIN sims s ON r.sim=s.id JOIN grants g ON s.project=g.project
      WHERE g.login=? AND a.outcome='Destination ou secret non autorisé'`,
      )
      .get(user.name).total,
    online: !!heartbeat && Date.now() - heartbeat < 30000,
    lag: row.due ? Math.max(0, Date.now() - row.due) : 0,
    heartbeat,
  };
}
export async function administration(req, parts, db) {
  try {
    db ??= database();
    const [resource, id, action] = parts;
    const method = req.method,
      write = method === "POST";
    const requestUrl = new URL(req.url);
    const origin =
      process.env.RELAIS_ORIGIN ||
      requestUrl.protocol + "//" + (req.headers.get("host") || requestUrl.host);
    if (
      write &&
      req.headers.get("origin") &&
      req.headers.get("origin") !== origin
    )
      throw new Problem(403, "Origine de la requête refusée.");
    let payload = {};
    if (write) {
      if (!req.headers.get("content-type")?.startsWith("application/json"))
        throw new Problem(415, "JSON requis.");
      const raw = await readBody(req, 131072);
      try {
        payload = JSON.parse(raw || "{}");
        if (!payload || typeof payload !== "object") throw Error();
      } catch {
        throw new Problem(400, "Document JSON invalide.");
      }
    }
    const cookie =
      req.headers
        .get("cookie")
        ?.match(/(?:^|;\s*)relais_session=([\w-]+)/)?.[1] || "";
    const cookieValue = (val, age) =>
      `relais_session=${val}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${new URL(origin).protocol === "https:" ? "; Secure" : ""}`;
    if (["login", "register", "migrate"].includes(resource) && write) {
      limit(db, "login", 90);
      const session =
        resource === "login"
          ? payload.email !== undefined
            ? await passwordLogin(db, payload)
            : signIn(db, String(payload.key || ""))
          : await enroll(db, payload, resource === "migrate");
      return json({ ok: true }, 200, {
        "set-cookie": cookieValue(session, 28800),
      });
    }
    const user = identity(db, cookie);
    if (resource === "logout" && write) {
      db.prepare("DELETE FROM sessions WHERE token=?").run(hash(cookie));
      return json({ ok: true }, 200, { "set-cookie": cookieValue("", 0) });
    }
    if (resource === "receivers" && write) {
      if (!id) return json(registerReceiver(db, user, payload), 201);
      await reviewReceiver(db, user, id, payload.action);
      return json({ ok: true });
    }
    if (resource === "projects" && write)
      return json(newProject(db, user, payload.name), 201);
    if (resource === "environments" && write)
      return json(newEnvironment(db, user, payload.project, payload.name), 201);
    if (resource === "sharing" && action)
      return json(sharing(db, user, id, action, write ? payload : null));
    if (resource === "workspace" && !write) {
      const items = library(db, user);
      const allowed = destinations().flatMap((d) => {
        const projects = user.projects.filter((p) => {
          try {
            target(d.id, p, null, [d]);
            return true;
          } catch {
            return false;
          }
        });
        return projects.length
          ? [
              {
                id: d.id,
                label: d.label,
                url: d.url,
                status: "active",
                projects,
              },
            ]
          : [];
      });
      const receivers = receiverList(db, user);
      return json({
        user,
        environments: environments(db, user),
        items,
        runs: runs(db, user),
        runCounts: db
          .prepare(
            `SELECT s.project,count(*) total FROM runs r JOIN sims s ON r.sim=s.id
          JOIN grants g ON g.project=s.project WHERE g.login=? GROUP BY s.project`,
          )
          .all(user.name),
        destinations: [...allowed, ...receivers.own],
        receiverReview: receivers.review,
        health: technical(db, user),
      });
    }
    if (resource === "scenarios" && write) {
      if (!id || action === "save" || action === "publish")
        return json(
          save(
            db,
            user,
            payload.draft,
            id,
            payload.revision,
            action === "publish" || (!id && payload.publish === true),
          ),
        );
      if (action === "duplicate")
        return json(
          duplicate(db, user, id, payload.project, payload.environment),
        );
      scenario(db, user, id);
      if (action === "archive") {
        archive(db, user, id);
        return json({ ok: true });
      }
      if (action === "run") {
        const { config } = activeConfig(db, id);
        const r = trigger(db, {
          id,
          user,
          path: config.path,
          method: config.method,
          raw: String(payload.raw || ""),
          sha: String(payload.sha || ""),
        });
        return json({ id: r.id });
      }
    }
    if (resource === "versions" && !write) {
      scenario(db, user, id);
      return json(
        db
          .prepare(
            "SELECT number,published,config FROM versions WHERE sim=? ORDER BY number DESC",
          )
          .all(id)
          .map((v) => ({ ...v, config: JSON.parse(v.config) })),
      );
    }
    if (resource === "runs" && id) {
      if (!write) return json(execution(db, user, id));
      if (action === "replay") {
        replayDelivery(db, user, id);
        return json(execution(db, user, id));
      }
      if (action === "cancel") {
        cancel(db, user, id);
        return json(execution(db, user, id));
      }
    }
    throw new Problem(404, "Ressource introuvable.");
  } catch (e) {
    return errorResponse(e);
  }
}
