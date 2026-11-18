import { randomUUID } from "node:crypto";
import { createProject, granted } from "./access.mjs";
import { Problem, transaction } from "./db.mjs";

function resourceName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,79}$/u.test(name))
    throw new Problem(422, "Saisissez un nom de 1 à 80 caractères.");
  return name;
}
export function newProject(db, user, value) {
  const name = resourceName(value);
  return transaction(db, () => {
    if (
      db.prepare("SELECT 1 FROM projects WHERE name=? COLLATE NOCASE").get(name)
    )
      throw new Problem(409, "Ce nom de projet est déjà utilisé.");
    const key = createProject(db, name);
    db.prepare("INSERT INTO grants VALUES(?,?)").run(user.name, name);
    return { name, key };
  });
}
export function newEnvironment(db, user, project, value) {
  granted(user, project);
  const name = resourceName(value),
    id = randomUUID();
  if (
    !db
      .prepare(
        "INSERT OR IGNORE INTO environments(id,project,name) VALUES(?,?,?)",
      )
      .run(id, project, name).changes
  )
    throw new Problem(409, "Cet environnement existe déjà dans le projet.");
  return { id, name, project };
}
export function environments(db, user) {
  return db
    .prepare(
      `SELECT e.*,g.login IS NOT NULL writable FROM environments e
    LEFT JOIN grants g ON g.project=e.project AND g.login=:login
    WHERE g.login IS NOT NULL OR EXISTS(SELECT 1 FROM sharing h WHERE h.kind='environment' AND h.resource=e.id AND h.recipient IN (:login,'*'))
    ORDER BY e.project,e.primary_env DESC,e.name`,
    )
    .all({ login: user.name });
}
export function environmentFor(db, project, id) {
  const env = id
    ? db
        .prepare("SELECT id FROM environments WHERE project=? AND id=?")
        .get(project, id)
    : db
        .prepare(
          "SELECT id FROM environments WHERE project=? AND primary_env=1",
        )
        .get(project);
  if (!env)
    throw new Problem(422, "Sélectionnez un environnement de ce projet.");
  return env.id;
}
function manageable(db, user, kind, id) {
  if (!["simulation", "environment"].includes(kind))
    throw new Problem(404, "Ressource introuvable.");
  const sql =
    kind === "simulation"
      ? "SELECT project FROM sims WHERE id=?"
      : "SELECT project FROM environments WHERE id=?";
  const row = db.prepare(sql).get(id);
  if (!row) throw new Problem(404, "Ressource introuvable.");
  granted(user, row.project);
}
export function sharing(db, user, kind, id, change) {
  manageable(db, user, kind, id);
  return transaction(db, () => {
    if (change) {
      const { action, email } = change;
      let recipient = "*";
      if (["invite", "remove"].includes(action)) {
        const account = db
          .prepare("SELECT login FROM passwords WHERE email=?")
          .get(
            String(email || "")
              .trim()
              .toLowerCase(),
          );
        if (!account)
          throw new Problem(422, "Aucun compte inscrit à cette adresse.");
        if (account.login === user.name)
          throw new Problem(422, "Vous avez déjà accès à cette ressource.");
        recipient = account.login;
      }
      if (["invite", "public"].includes(action))
        db.prepare("INSERT OR IGNORE INTO sharing VALUES(?,?,?)").run(
          kind,
          id,
          recipient,
        );
      else if (["remove", "restricted"].includes(action))
        db.prepare(
          "DELETE FROM sharing WHERE kind=? AND resource=? AND recipient=?",
        ).run(kind, id, recipient);
      else throw new Problem(422, "Action de partage inconnue.");
    }
    const rows = db
      .prepare(
        "SELECT recipient,email FROM sharing LEFT JOIN passwords ON login=recipient WHERE kind=? AND resource=? ORDER BY email",
      )
      .all(kind, id);
    return {
      public: rows.some((r) => r.recipient === "*"),
      emails: rows.filter((r) => r.email).map((r) => r.email),
    };
  });
}
