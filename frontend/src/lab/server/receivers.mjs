import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { granted } from "./access.mjs";
import { Problem, transaction } from "./db.mjs";
import { destinations, pilotUrl, target } from "./targets.mjs";

const allRows = "SELECT r.* FROM receivers r";
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
/** Resolve once and pin the public IPv4 used by the worker for HTTPS. */
async function resolveAddress(url, project, resolve) {
  let addresses;
  try {
    addresses = await resolve(new URL(url).hostname, { all: true, family: 4 });
  } catch {
    throw new Problem(422, "Impossible de résoudre le nom de domaine.");
  }
  if (!addresses.length)
    throw new Problem(422, "Aucune adresse IPv4 publique disponible.");
  for (const { address } of addresses)
    target("receiver", project, url, [
      entry({ id: "receiver", project, url, ip: address }),
    ]);
  return addresses[0].address;
}

export async function registerReceiver(db, user, payload, resolve = lookup) {
  const { project } = payload;
  granted(user, project);
  const url = canonical(payload.url);
  const configured = destinations();
  const preset = configured.find(
    (c) => c.url === url && c.projects.includes(project),
  );
  if (!payload.id && preset) {
    target(preset.id, project, url, configured);
    return { id: preset.id, url, status: "active" };
  }
  const pilot = url === pilotUrl;
  if (pilot && !configured.some((c) => c.pilot && c.url === pilotUrl))
    throw new Problem(422, "Récepteur local désactivé sur cette installation.");

  // Older drafts may refer to different IDs for the same URL. Update the selected ID in place.
  const findRow = () =>
    payload.id
      ? db
          .prepare("SELECT * FROM receivers WHERE project=? AND url=? AND id=?")
          .get(project, url, payload.id)
      : db
          .prepare(
            "SELECT * FROM receivers WHERE project=? AND url=? ORDER BY (status='active') DESC,id LIMIT 1",
          )
          .get(project, url);
  const current = findRow();
  if (payload.id && !current)
    throw new Problem(404, "URL de réception introuvable.");
  if (current?.status === "active") {
    target(current.id, project, url, [entry(current)]);
    return { id: current.id, url, status: "active" };
  }
  const ip = pilot ? null : await resolveAddress(url, project, resolve);
  return transaction(db, () => {
    // The DNS lookup yields to concurrent requests. Recheck membership and reuse the winning ID.
    if (
      !db
        .prepare("SELECT 1 FROM grants WHERE login=? AND project=?")
        .get(user.name, project)
    )
      throw new Problem(404, "Projet introuvable.");
    const row = findRow(),
      id = row?.id ?? randomUUID();
    if (!row)
      db.prepare(
        "INSERT INTO receivers(id,project,url,status,ip) VALUES(?,?,?,'active',?)",
      ).run(id, project, url, ip);
    else if (row.status !== "active")
      db.prepare("UPDATE receivers SET status='active', ip=? WHERE id=?").run(
        ip,
        id,
      );
    return { id, url, status: "active" };
  });
}
export function receiverList(db, user) {
  return db
    .prepare(
      allRows +
        " WHERE EXISTS (SELECT 1 FROM grants g WHERE g.project=r.project AND g.login=?) ORDER BY r.project,r.url",
    )
    .all(user.name)
    .map((r) => ({ ...entry(r), status: r.status }));
}
