import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../../src/lab/server/db.mjs";
import {
  library,
  save,
  trigger,
  execution,
} from "../../src/lab/server/scenarios.mjs";
import { createProject } from "../../src/lab/server/access.mjs";
import { blank } from "../../src/lab/model.ts";

test("legacy scope migration preserves existing grants, receiver IDs and pending deliveries across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "relais-migration-")),
    file = join(dir, "test.sqlite");
  let db = openDatabase(file);
  try {
    const key = createProject(db, "Atlas"),
      owner = { name: "owner", projects: ["Atlas"] },
      reader = { name: "reader", projects: [] },
      stranger = { name: "someone", projects: [] };
    const make = (name) =>
      save(
        db,
        owner,
        { ...blank("Atlas"), name, webhook: true, destination: "active-id" },
        null,
        null,
        true,
        [
          {
            id: "active-id",
            pilot: true,
            url: "http://127.0.0.1:3922/recette",
            projects: ["Atlas"],
          },
        ],
      );
    const primary = make("Public"),
      shared = make("Invité"),
      other = make("Privé");
    const run = trigger(
      db,
      {
        id: shared.id,
        key,
        method: shared.draft.method,
        path: shared.draft.path,
      },
      [
        {
          id: "active-id",
          pilot: true,
          url: "http://127.0.0.1:3922/recette",
          projects: ["Atlas"],
        },
      ],
    );
    db.exec(`DROP TABLE receivers;
 CREATE TABLE environments(id TEXT PRIMARY KEY,project TEXT REFERENCES projects(name),name TEXT,primary_env INTEGER);
 CREATE TABLE receivers(id TEXT PRIMARY KEY,environment TEXT REFERENCES environments(id),url TEXT,status TEXT,ip TEXT,UNIQUE(environment,url));
 INSERT INTO environments VALUES('a','Atlas','Recette',1),('b','Atlas','Equipe',0),('c','Atlas','Privé',0);
 INSERT INTO receivers VALUES('active-id','b','https://example.test/hook','active','8.8.8.8'),('denied-id','c','https://example.test/hook','revoked',NULL);
 INSERT INTO sharing VALUES('environment','a','*'),('environment','b','reader');`);
    for (const [id, env] of [
      [shared.id, "b"],
      [other.id, "c"],
    ]) {
      db.prepare(
        "UPDATE sims SET draft=json_set(draft,'$.environment',?) WHERE id=?",
      ).run(env, id);
      db.prepare(
        "UPDATE versions SET config=json_set(config,'$.environment',?) WHERE sim=?",
      ).run(env, id);
    }
    const previous = execution(db, owner, run.id);
    for (let pass = 0; pass < 2; pass++) {
      db.close();
      db = openDatabase(file);
      assert.deepEqual(
        new Set(library(db, reader).map((i) => i.id)),
        new Set([primary.id, shared.id]),
      );
      assert.deepEqual(
        library(db, stranger).map((i) => i.id),
        [primary.id],
      );
      assert.deepEqual(execution(db, owner, run.id), previous);
      assert.deepEqual(
        db
          .prepare("SELECT id,project,status FROM receivers ORDER BY id")
          .all()
          .map((r) => [r.id, r.project, r.status]),
        [
          ["active-id", "Atlas", "active"],
          ["denied-id", "Atlas", "revoked"],
        ],
      );
      assert.equal(
        db
          .prepare(
            "SELECT count(*) n FROM versions WHERE json_type(config,'$.environment') IS NOT NULL",
          )
          .get().n,
        0,
      );
      assert.equal(
        db
          .prepare(
            "SELECT count(*) n FROM sqlite_master WHERE name='environments'",
          )
          .get().n,
        0,
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
