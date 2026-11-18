import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { openDatabase } from "../../src/lab/server/db.mjs";
import { identity, signIn } from "../../src/lab/server/access.mjs";
test("provisioning is repeatable; grants take effect in an open session", () => {
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
    assert.equal(cmd("init"), 0);
    assert.equal(cmd("verify-destinations"), 0);
    assert.equal(cmd("project", "QA"), 0);
    assert.equal(cmd("account", "Alice", "QA"), 0);
    const db = openDatabase(join(dir, "relais.sqlite")),
      access = JSON.parse(readFileSync(join(dir, "compte-Alice.json")));
    const session = signIn(db, access.cle_interface);
    assert.deepEqual(identity(db, session).projects, ["QA"]);
    assert.equal(cmd("grant", "Alice", "Atlas"), 0);
    assert.deepEqual(identity(db, session).projects, ["Atlas", "QA"]);
    assert.equal(cmd("revoke", "Alice", "Atlas"), 0);
    assert.deepEqual(identity(db, session).projects, ["QA"]);
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
