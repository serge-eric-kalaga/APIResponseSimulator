import test from "node:test";
import assert from "node:assert/strict";
import {
  identity,
  createAccount,
  createProject,
  openSession,
} from "../../src/lab/server/access.mjs";
import { openDatabase } from "../../src/lab/server/db.mjs";
import {
  registerReceiver,
  receiverList,
} from "../../src/lab/server/receivers.mjs";
import { save, trigger, execution } from "../../src/lab/server/scenarios.mjs";
import { deliverOne } from "../../src/lab/server/outbox.mjs";
import { blank } from "../../src/lab/model.ts";
test("a registered receiver is ready to publish and deliver within its project", async () => {
  const db = openDatabase(":memory:");
  try {
    const key = createProject(db, "Test");
    const owner = identity(
      db,
      openSession(db, createAccount(db, "a", ["Test"])),
    );
    createProject(db, "Autre");
    const other = identity(
      db,
      openSession(db, createAccount(db, "autre", ["Autre"])),
    );
    const payload = {
      project: "Test",
      url: "https://qa.example.test/receiver",
    };
    const resolve = async () => [{ address: "8.8.8.8" }];
    await assert.rejects(
      registerReceiver(db, other, payload, resolve),
      (e) => e.status === 404,
    );
    await assert.rejects(
      registerReceiver(db, owner, payload, async () => [
        { address: "8.8.8.8" },
        { address: "127.0.0.1" },
      ]),
      (e) => e.status === 422,
    );
    assert.deepEqual(receiverList(db, owner), []);
    const [r, concurrent] = await Promise.all([
      registerReceiver(db, owner, payload, resolve),
      registerReceiver(db, owner, payload, resolve),
    ]);
    assert.equal(r.status, "active");
    assert.equal(r.id, concurrent.id);
    assert.deepEqual(receiverList(db, other), []);
    // A saved draft may still point at a previous pending ID for the very same URL.
    db.prepare(
      "INSERT INTO receivers(id,project,url,status) VALUES(?,?,?,'pending')",
    ).run("saved-id", "Test", payload.url);
    const restored = await registerReceiver(
      db,
      owner,
      { ...payload, id: "saved-id" },
      resolve,
    );
    assert.equal(restored.id, "saved-id");
    assert.equal(restored.status, "active");
    const d = {
      ...blank("Test"),
      name: "Exemple",
      webhook: true,
      delay: 0,
      destination: restored.id,
    };
    assert.throws(() =>
      save(db, other, { ...d, project: "Autre" }, null, null, true),
    );
    const sim = save(db, owner, d, null, null, true),
      run = trigger(db, { id: sim.id, method: d.method, path: d.path, key });
    let delivered;
    await deliverOne(db, undefined, async (job, entry) => {
      delivered = { url: job.url, ip: entry.ip };
      return 204;
    });
    assert.deepEqual(delivered, { url: payload.url, ip: "8.8.8.8" });
    assert.equal(execution(db, owner, run.id).job.state, "delivered");
  } finally {
    db.close();
  }
});
