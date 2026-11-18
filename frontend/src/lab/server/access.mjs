import { createHash, randomBytes } from "node:crypto";
import { Problem, transaction } from "./db.mjs";
export const hash = (s) => createHash("sha256").update(s).digest("hex");
const key = () => randomBytes(32).toString("base64url");
export function createProject(db, name) {
  const token = key();
  db.prepare("INSERT INTO projects VALUES(?,?)").run(name, hash(token));
  return token;
}
/** Insert the account and its project grants inside the caller's transaction. */
export function insertAccount(db, login, projects) {
  const token = key();
  db.prepare("INSERT INTO accounts VALUES(?,?)").run(login, hash(token));
  for (const project of projects)
    db.prepare("INSERT INTO grants VALUES(?,?)").run(login, project);
  return token;
}
export function createAccount(db, login, projects) {
  return transaction(db, () => insertAccount(db, login, projects));
}
export function signIn(db, token) {
  const account = db
    .prepare("SELECT name FROM accounts WHERE key_hash=?")
    .get(hash(token));
  if (!account) throw new Problem(401, "Clé d’accès invalide.");
  const session = key();
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(session),
    account.name,
    Date.now() + 8 * 3600000,
  );
  return session;
}
export function identity(db, session) {
  const account = db
    .prepare("SELECT login FROM sessions WHERE token=? AND expires>?")
    .get(hash(session), Date.now());
  if (!account)
    throw new Problem(401, "Connectez-vous pour ouvrir votre espace.");
  return {
    name: account.login,
    projects: db
      .prepare("SELECT project FROM grants WHERE login=? ORDER BY project")
      .all(account.login)
      .map((x) => x.project),
  };
}
export function granted(user, project) {
  if (!user.projects.includes(project))
    throw new Problem(404, "Ressource introuvable.");
}
