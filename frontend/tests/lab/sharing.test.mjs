import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../../src/lab/server/db.mjs";
import {
  newProject,
  sharing,
  projects,
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
test("project and simulation grants compose, revoke and isolate writes", async () => {
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
    const sim = save(db, owner, {
      ...blank("Equipe"),
      name: "Contrat",
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
    sharing(db, owner, "project", sim.project, { action: "public" });
    const added = save(db, owner, {
      ...blank("Equipe"),
      name: "Suite",
    });
    assert.equal(library(db, third).length, 3);
    assert.equal(projects(db, third)[0].name, sim.project);
    sharing(db, owner, "project", sim.project, { action: "restricted" });
    assert.equal(library(db, third).length, 0);
    sharing(db, owner, "simulation", added.id, { action: "public" });
    assert.equal(library(db, third).length, 1);
    assert.throws(() =>
      sharing(db, third, "project", sim.project, { action: "public" }),
    );
  } finally {
    db.close();
  }
});

test("a private project invitation exposes published versions and preserves independent simulation grants", async () => {
  const db = openDatabase(":memory:");
  try {
    const ownerToken = await enroll(db, {
      email: "owner@example.test",
      password: "mot-de-passe-recette",
    });
    const reader = identity(
      db,
      await enroll(db, {
        email: "reader@example.test",
        password: "mot-de-passe-recette",
      }),
    );
    newProject(db, identity(db, ownerToken), "Atelier");
    const owner = identity(db, ownerToken);
    const config = {
      ...blank("Atelier"),
      name: "Version publiée",
    };
    const sim = save(db, owner, config, null, null, true);
    save(
      db,
      owner,
      { ...config, name: "Brouillon suivant" },
      sim.id,
      sim.revision,
    );
    const invitation = { action: "invite", email: "reader@example.test" };
    sharing(db, owner, "project", sim.project, invitation);
    assert.equal(library(db, reader, sim.id)[0].draft.name, "Version publiée");
    assert.equal(projects(db, reader)[0].name, sim.project);
    sharing(db, owner, "simulation", sim.id, invitation);
    sharing(db, owner, "project", sim.project, {
      ...invitation,
      action: "remove",
    });
    assert.deepEqual(projects(db, reader), []);
    assert.equal(library(db, reader, sim.id)[0].draft.name, "Version publiée");
    sharing(db, owner, "simulation", sim.id, {
      ...invitation,
      action: "remove",
    });
    assert.deepEqual(library(db, reader, sim.id), []);
  } finally {
    db.close();
  }
});
