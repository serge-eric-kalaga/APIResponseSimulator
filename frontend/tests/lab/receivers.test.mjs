import test from "node:test";
import assert from "node:assert/strict";
import {
  identity,
  createAccount,
  createProject,
  signIn,
} from "../../src/lab/server/access.mjs";
import { openDatabase } from "../../src/lab/server/db.mjs";
import {
  registerReceiver,
  reviewReceiver,
} from "../../src/lab/server/receivers.mjs";
import { newEnvironment } from "../../src/lab/server/workspaces.mjs";
import { save, trigger, execution } from "../../src/lab/server/scenarios.mjs";
import { deliverOne } from "../../src/lab/server/outbox.mjs";
import { blank } from "../../src/lab/model.ts";
test("a registered receiver is scoped, approved, snapshotted and rechecked before delivery", async () => {
  const db = openDatabase(":memory:");
  try {
    const key = createProject(db, "Test");
    const owner = identity(db, signIn(db, createAccount(db, "a", ["Test"])));
    const admin = identity(db, signIn(db, createAccount(db, "Pilote", [])));
    db.prepare("INSERT INTO operators VALUES(?)").run(admin.name);
    const environment = newEnvironment(db, owner, "Test", "Dev").id;
    const payload = {
      project: "Test",
      environment,
      url: "https://qa.example.test/receiver",
    };
    assert.throws(() => registerReceiver(db, admin, payload));
    const r = registerReceiver(db, owner, payload);
    assert.equal(r.status, "pending");
    assert.equal(registerReceiver(db, owner, payload).id, r.id);
    const d = {
      ...blank("Test"),
      environment,
      name: "Exemple",
      webhook: true,
      delay: 0,
      destination: r.id,
    };
    assert.throws(() => save(db, owner, d, null, null, true));
    await assert.rejects(reviewReceiver(db, owner, r.id, "approve"));
    await assert.rejects(
      reviewReceiver(db, admin, r.id, "approve", async () => [
        { address: "127.0.0.1" },
      ]),
    );
    await reviewReceiver(db, admin, r.id, "approve", async () => [
      { address: "8.8.8.8" },
    ]);
    assert.throws(() =>
      save(db, owner, { ...d, environment: undefined }, null, null, true),
    );
    const sim = save(db, owner, d, null, null, true),
      run = trigger(db, { id: sim.id, method: d.method, path: d.path, key });
    await reviewReceiver(db, admin, r.id, "revoke");
    let sent = false;
    await deliverOne(db, undefined, async () => {
      sent = true;
      return 204;
    });
    assert.equal(sent, false);
    assert.equal(execution(db, owner, run.id).job.state, "failed");
  } finally {
    db.close();
  }
});
