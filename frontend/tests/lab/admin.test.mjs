import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { openDatabase } from "../../src/lab/server/db.mjs";
import { identity, createAccount } from "../../src/lab/server/access.mjs";
import { enroll, passwordLogin } from "../../src/lab/server/passwords.mjs";
test("provisioning is repeatable; grants take effect in an open session", async () => {
  const dir = mkdtempSync(join(tmpdir(), "relais-grants-"));
  const cmd = (...args) =>
    spawnSync(process.execPath, ["scripts/lab-admin.mjs", ...args], {
      env: {
        ...process.env,
        RELAIS_HOME: dir,
        RELAIS_DB: join(dir, "relais.sqlite"),
        RELAIS_DESTINATIONS: join(dir, "destinations.json"),
      },
    }).status;
  try {
    assert.equal(cmd("init"), 0);
    const pilot = JSON.parse(readFileSync(join(dir, "connexion-pilote.json")));
    assert.equal(cmd("init"), 0);
    assert.equal(cmd("verify-destinations"), 0);
    assert.equal(cmd("project", "QA"), 0);
    const db = openDatabase(join(dir, "relais.sqlite"));
    assert.deepEqual(identity(db, await passwordLogin(db, pilot)).projects, [
      "Atlas",
      "Studio",
    ]);
    const email = "alice@example.test";
    const session = await enroll(db, {
      email,
      password: "mot-de-passe-recette",
    });
    assert.equal(cmd("grant", email, "QA"), 0);
    assert.deepEqual(identity(db, session).projects, ["QA"]);
    assert.equal(cmd("revoke", email, "QA"), 0);
    assert.deepEqual(identity(db, session).projects, []);
    createAccount(db, "Ancien", []);
    assert.equal(cmd("grant", "Ancien", "Atlas"), 0);
    assert.equal(cmd("activate", "Ancien", email), 1);
    assert.equal(cmd("activate", "Ancien", "ancien@example.test"), 0);
    assert.notEqual(cmd("activate", "Ancien", "nouveau@example.test"), 0);
    const restored = JSON.parse(
      readFileSync(join(dir, "connexion-Ancien.json")),
    );
    assert.deepEqual(identity(db, await passwordLogin(db, restored)).projects, [
      "Atlas",
    ]);
    writeFileSync(join(dir, "projet-Echec.json"), "existant");
    assert.notEqual(cmd("project", "Echec"), 0);
    assert.equal(
      db.prepare("SELECT * FROM projects WHERE name='Echec'").get(),
      undefined,
    );
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
