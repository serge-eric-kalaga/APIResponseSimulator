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
  // Existing databases require a unique key_hash. This placeholder is never an authentication credential.
  db.prepare(
    "INSERT INTO accounts(name,key_hash) VALUES(?,hex(randomblob(32)))",
  ).run(login);
  for (const project of projects)
    db.prepare("INSERT INTO grants VALUES(?,?)").run(login, project);
  return login;
}
export function createAccount(db, login, projects) {
  return transaction(db, () => insertAccount(db, login, projects));
}
export function openSession(db, login) {
  const session = key();
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(session),
    login,
    Date.now() + 8 * 3600000,
  );
  return session;
}
export function identity(db, session) {
  const account = db
    .prepare(
      `SELECT s.login,p.email,COALESCE(n.first_name,'') firstName,COALESCE(n.last_name,'') lastName
      FROM sessions s LEFT JOIN passwords p ON p.login=s.login LEFT JOIN account_profiles n ON n.login=s.login
      WHERE s.token=? AND s.expires>?`,
    )
    .get(hash(session), Date.now());
  if (!account)
    throw new Problem(401, "Connectez-vous pour ouvrir votre espace.");
  return {
    name: account.login,
    email: account.email,
    firstName: account.firstName,
    lastName: account.lastName,
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
