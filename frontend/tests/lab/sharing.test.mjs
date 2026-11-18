import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../../src/lab/server/db.mjs";
import {
  newProject,
  newEnvironment,
  sharing,
  environments,
} from "../../src/lab/server/workspaces.mjs";
import { enroll } from "../../src/lab/server/passwords.mjs";
import { identity } from "../../src/lab/server/access.mjs";
import {
  duplicate,
  library,
  save,
  archive,
} from "../../src/lab/server/scenarios.mjs";
import { blank } from "../../src/lab/model.ts";
test("environment and simulation grants compose, revoke and isolate writes", async () => {
  const db = openDatabase(":memory:");
  try {
    const users = [];
    for (const name of ["a", "b", "c"])
      users.push(
        identity(
          db,
          await enroll(db, {
            email: name + "@qa.test",
            password: "1234567890x",
          }),
        ),
      );
    const [owner, reader, third] = users;
    newProject(db, owner, "Equipe");
    owner.projects = ["Equipe"];
    newProject(db, reader, "Personnel");
    reader.projects = ["Personnel"];
    const env = newEnvironment(db, owner, "Equipe", "Intégration");
    const sim = save(db, owner, {
      ...blank("Equipe"),
      name: "Contrat",
      environment: env.id,
    });
    save(db, owner, { ...blank("Equipe"), name: "Privé" });
    assert.deepEqual(library(db, reader), []);
    assert.throws(() => archive(db, reader, sim.id));
    sharing(db, owner, "simulation", sim.id, {
      action: "invite",
      email: "b@qa.test",
    });
    assert.equal(library(db, reader)[0].writable, 0);
    assert.equal(library(db, third).length, 0);
    assert.throws(() =>
      sharing(db, reader, "simulation", sim.id, { action: "public" }),
    );
    const copy = duplicate(db, reader, sim.id, "Personnel");
    assert.equal(copy.project, "Personnel");
    sharing(db, owner, "simulation", sim.id, {
      action: "remove",
      email: "b@qa.test",
    });
    sharing(db, owner, "environment", env.id, { action: "public" });
    const added = save(db, owner, {
      ...blank("Equipe"),
      name: "Suite",
      environment: env.id,
    });
    assert.equal(library(db, third).length, 2);
    assert.equal(environments(db, third)[0].id, env.id);
    sharing(db, owner, "environment", env.id, { action: "restricted" });
    assert.equal(library(db, third).length, 0);
    sharing(db, owner, "simulation", added.id, { action: "public" });
    assert.equal(library(db, third).length, 1);
    assert.throws(() => newEnvironment(db, third, "Equipe", "Intrus"));
  } finally {
    db.close();
  }
});
