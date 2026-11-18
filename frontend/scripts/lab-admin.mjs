import {
  mkdirSync,
  existsSync,
  chmodSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { bindPassword, preparePassword } from "../src/lab/server/passwords.mjs";
import { resolve } from "node:path";
import { openDatabase, transaction } from "../src/lab/server/db.mjs";
import { insertAccount, createProject } from "../src/lab/server/access.mjs";
import { save } from "../src/lab/server/scenarios.mjs";
import { pilotUrl, target } from "../src/lab/server/targets.mjs";
import { referenceScenarios } from "../src/lab/fixtures.ts";
const dir = resolve(process.env.RELAIS_HOME || "../data"),
  file = process.env.RELAIS_DB || resolve(dir, "relais.sqlite");
process.umask(0o077);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const db = openDatabase(file),
  config = process.env.RELAIS_DESTINATIONS || resolve(dir, "destinations.json");
const [command = "init", name, ...args] = process.argv.slice(2);
const valid = (s) =>
  typeof s === "string" && /^[\p{L}\p{N} _.-]{1,80}$/u.test(s);
const write = (file, data) =>
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
// The local administrator can activate an existing account while keeping its project ownership.
async function activate(login, email, path) {
  const linked = () =>
    db.prepare("SELECT 1 FROM passwords WHERE login=?").get(login);
  if (linked()) return false;
  if (!db.prepare("SELECT 1 FROM accounts WHERE name=?").get(login))
    throw Error("Compte introuvable.");
  const saved = existsSync(path);
  const credentials = saved
    ? JSON.parse(readFileSync(path, "utf8"))
    : {
        email,
        password: randomBytes(24).toString("base64url"),
      };
  if (credentials.email !== email)
    throw Error("Adresse différente dans le fichier de connexion existant.");
  const record = await preparePassword(credentials);
  return transaction(db, () => {
    if (linked()) return false;
    bindPassword(db, login, record);
    db.prepare("DELETE FROM sessions WHERE login=?").run(login);
    if (!saved) write(path, credentials);
    return true;
  });
}
try {
  if (command === "init") {
    const credentials = resolve(dir, "acces-pilote.json");
    if (!existsSync(credentials)) {
      const keys = transaction(db, () => {
        const projects = {};
        for (const p of ["Atlas", "Studio"]) projects[p] = createProject(db, p);
        // This transaction also owns the access-file creation. An existing pilot is never reset.
        insertAccount(db, "Pilote", Object.keys(projects));
        write(credentials, {
          compte: "Pilote",
          cles_declenchement: projects,
        });
        return projects;
      });
      console.log("Projets initialisés :", Object.keys(keys).join(", "));
    }
    const pilotFile = resolve(dir, "connexion-pilote.json");
    if (!db.prepare("SELECT 1 FROM passwords WHERE login='Pilote'").get()) {
      let email = "pilote@http-simulator.test";
      if (existsSync(pilotFile))
        email = JSON.parse(readFileSync(pilotFile, "utf8")).email;
      else if (db.prepare("SELECT 1 FROM passwords WHERE email=?").get(email))
        email = `pilote-${randomBytes(8).toString("hex")}@http-simulator.test`;
      if (await activate("Pilote", email, pilotFile))
        console.log("Connexion du pilote :", pilotFile);
    }
    if (!existsSync(config))
      write(config, [
        {
          id: "pilot-receiver",
          label: "Récepteur de recette",
          projects: ["Atlas", "Studio"],
          url: pilotUrl,
          pilot: true,
        },
      ]);
    const user = { name: "Pilote", projects: ["Atlas", "Studio"] };
    db.prepare("INSERT OR IGNORE INTO operators VALUES(?)").run(user.name);
    const entries = JSON.parse(readFileSync(config, "utf8"));
    db.exec("CREATE TABLE IF NOT EXISTS pilot_fixtures(name TEXT PRIMARY KEY)");
    for (const d of referenceScenarios())
      if (
        !db.prepare("SELECT 1 FROM pilot_fixtures WHERE name=?").get(d.name)
      ) {
        const existing = db
          .prepare(
            "SELECT id FROM sims WHERE project=? AND json_extract(draft,'$.name')=?",
          )
          .get(d.project, d.name);
        if (!existing) save(db, user, d, null, null, true, entries);
        db.prepare("INSERT INTO pilot_fixtures VALUES(?)").run(d.name);
      }
    console.log("Accès locaux :", credentials);
  } else if (command === "project" && valid(name)) {
    transaction(db, () =>
      write(resolve(dir, "projet-" + name + ".json"), {
        projet: name,
        cle_declenchement: createProject(db, name),
      }),
    );
  } else if (command === "activate" && valid(name) && args.length === 1) {
    const path = resolve(dir, "connexion-" + name + ".json");
    if (!(await activate(name, args[0].trim().toLowerCase(), path)))
      throw Error("Ce compte possède déjà un mot de passe.");
    console.log("Connexion du compte :", path);
  } else if (command === "grant" || command === "revoke") {
    if (!name || !valid(args[0])) throw Error("Compte et projet requis.");
    const account = valid(name)
      ? db.prepare("SELECT name AS login FROM accounts WHERE name=?").get(name)
      : db
          .prepare("SELECT login FROM passwords WHERE email=?")
          .get(name.trim().toLowerCase());
    if (!account) throw Error("Compte introuvable.");
    db.prepare(
      command === "grant"
        ? "INSERT OR IGNORE INTO grants VALUES(?,?)"
        : "DELETE FROM grants WHERE login=? AND project=?",
    ).run(account.login, args[0]);
  } else if (command === "verify-destinations") {
    for (const entry of JSON.parse(readFileSync(config, "utf8")))
      for (const p of entry.projects) target(entry.id, p, null, [entry]);
    console.log("Destinations validées.");
  } else
    throw Error(
      "Commandes : init, project NOM, activate NOM EMAIL, grant EMAIL PROJET, revoke EMAIL PROJET, verify-destinations.",
    );
  chmodSync(file, 0o600);
} finally {
  db.close();
}
