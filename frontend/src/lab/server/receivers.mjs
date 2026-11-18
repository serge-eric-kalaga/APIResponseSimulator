import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { granted } from "./access.mjs";
import { Problem, transaction } from "./db.mjs";
import { destinations, pilotUrl, target } from "./targets.mjs";

const allRows = "SELECT r.* FROM receivers r";
export function isOperator(db, user) {
  return !!db.prepare("SELECT 1 FROM operators WHERE login=?").get(user.name);
}
function canonical(value) {
  if (typeof value !== "string" || value.length > 2048 || !URL.canParse(value))
    throw new Problem(422, "Saisissez une URL de réception valide.");
  const u = new URL(value);
  if (
    u.href !== pilotUrl &&
    (u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hash ||
      u.search ||
      isIP(u.hostname) ||
      !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname))
  )
    throw new Problem(
      422,
      "Utilisez une URL HTTPS de recette avec un nom de domaine, sans identifiants, paramètres ni fragment.",
    );
  return u.href;
}
function entry(row) {
  return {
    id: row.id,
    url: row.url,
    ip: row.ip,
    environment: "test",
    label: row.url,
    projects: [row.project],
    pilot: row.url === pilotUrl,
  };
}
export function entriesFor(db, project) {
  const configured = destinations();
  const localEnabled = configured.some((c) => c.pilot && c.url === pilotUrl);
  const custom = db
    .prepare(allRows + " WHERE r.project=? AND r.status='active'")
    .all(project)
    .filter((r) => r.url !== pilotUrl || localEnabled)
    .map(entry);
  return [...configured, ...custom];
}
export function registerReceiver(db, user, payload) {
  const { project } = payload;
  granted(user, project);
  const url = canonical(payload.url),
    configured = destinations();
  const existing = configured.find(
    (c) => c.url === url && c.projects.includes(project),
  );
  if (existing) {
    target(existing.id, project, null, configured);
    return { id: existing.id, status: "active", url };
  }
  const pilot = url === pilotUrl;
  if (pilot && !configured.some((c) => c.pilot && c.url === pilotUrl))
    throw new Problem(422, "Récepteur local désactivé sur cette installation.");
  // Older projects can contain the same URL under several IDs. Keep existing
  // versions bound to their original approval; reuse a current ID for new drafts.
  return transaction(db, () => {
    const row = db
      .prepare(
        `SELECT id,url,status FROM receivers WHERE project=? AND url=?
      ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,id LIMIT 1`,
      )
      .get(project, url);
    if (row) return row;
    const id = randomUUID(),
      status = pilot ? "active" : "pending";
    db.prepare(
      "INSERT INTO receivers(id,project,url,status) VALUES(?,?,?,?)",
    ).run(id, project, url, status);
    return { id, url, status };
  });
}
export function receiverList(db, user) {
  const admin = isOperator(db, user);
  const rows = db
    .prepare(
      allRows +
        " WHERE EXISTS (SELECT 1 FROM grants g WHERE g.project=r.project AND g.login=?) ORDER BY r.project,r.url",
    )
    .all(user.name);
  return {
    canReview: admin,
    own: rows.map((r) => ({ ...entry(r), status: r.status })),
    review: admin
      ? db
          .prepare(allRows + " ORDER BY r.status,r.url")
          .all()
          .map(({ id, project, url, status }) => ({
            id,
            project,
            url,
            status,
          }))
      : [],
  };
}
/** Approval pins the public address of the operator-confirmed test service. Delivery rechecks the current grant. */
export async function reviewReceiver(db, user, id, action, resolve = lookup) {
  if (!isOperator(db, user))
    throw new Problem(
      403,
      "L’autorisation relève de l’administrateur du pilote.",
    );
  const row = db.prepare(allRows + " WHERE r.id=?").get(id);
  if (!row) throw new Problem(404, "URL inconnue.");
  if (action === "revoke") {
    db.prepare("UPDATE receivers SET status='revoked',ip=NULL WHERE id=?").run(
      id,
    );
    return;
  }
  if (action !== "approve") throw new Problem(422, "Action inconnue.");
  let ip = null;
  if (row.url !== pilotUrl) {
    let addresses;
    try {
      addresses = await resolve(new URL(row.url).hostname, {
        all: true,
        family: 4,
      });
    } catch {
      throw new Problem(422, "Impossible de résoudre le nom de domaine.");
    }
    if (!addresses.length)
      throw new Problem(422, "Aucune adresse IPv4 publique disponible.");
    for (const a of addresses) {
      target(id, row.project, row.url, [{ ...entry(row), ip: a.address }]);
    }
    ip = addresses[0].address;
  }
  const result = db
    .prepare(
      "UPDATE receivers SET status='active',ip=? WHERE id=? AND status=?",
    )
    .run(ip, id, row.status);
  if (!result.changes)
    throw new Problem(409, "L’autorisation a changé. Actualisez la liste.");
}
