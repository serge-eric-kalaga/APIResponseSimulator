import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDatabase } from "../../src/lab/server/db.mjs";
import {
  claim,
  finish,
  deliverOne,
  cancel,
  maintain,
} from "../../src/lab/server/outbox.mjs";
import { createAccount, createProject } from "../../src/lab/server/access.mjs";
import { save, trigger, execution } from "../../src/lab/server/scenarios.mjs";
import { pilotUrl } from "../../src/lab/server/targets.mjs";
import { blank } from "../../src/lab/model.ts";
const entries = [{ id: "local", projects: ["qa"], pilot: true, url: pilotUrl }];
function setup(file) {
  const db = openDatabase(file),
    key = createProject(db, "qa"),
    user = { name: "a", projects: ["qa"] };
  createAccount(db, "a", user.projects);
  const d = {
    ...blank("qa"),
    name: "Document",
    destination: "local",
    webhook: true,
    delay: 120,
  };
  const s = save(db, user, d, null, null, true, entries);
  const r = trigger(
    db,
    { id: s.id, key, method: d.method, path: d.path },
    entries,
    10000,
  );
  return { db, id: r.id, user };
}
test("persistent schedule, exclusive claims, crash recovery and stable notification", async () => {
  const dir = mkdtempSync(join(tmpdir(), "relais-")),
    file = join(dir, "store");
  try {
    const { db, id, user } = setup(file);
    db.close();
    const a = openDatabase(file),
      b = openDatabase(file);
    assert.equal(claim(a, 129999), null);
    const job = claim(a, 130000);
    assert.ok(job);
    assert.equal(claim(b, 130005), null);
    const recovered = claim(b, 160001);
    assert.equal(job.id, recovered.id);
    assert.equal(job.payload, recovered.payload);
    finish(a, job, 200, "late", false, 160002);
    finish(b, recovered, 503, "HTTP 503", true, 160005);
    assert.equal(claim(a, 160006), null);
    await deliverOne(
      a,
      entries,
      async (j) => {
        assert.equal(j.id, job.id);
        return 204;
      },
      190006,
    );
    const e = execution(a, user, id);
    assert.equal(e.job.state, "delivered");
    assert.equal(e.attempts.length, 3);
    assert.match(e.attempts[0].outcome, /inconnu/);
    a.close();
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("revocation, permanent refusal, cancellation and retention", async () => {
  for (const mode of ["revoked", "400", "302", "cancel"]) {
    const { db, id, user } = setup(":memory:");
    if (mode === "cancel") cancel(db, user, id);
    else
      await deliverOne(
        db,
        mode === "revoked" ? [] : entries,
        async () => Number(mode),
        130000,
      );
    assert.equal(
      execution(db, user, id).job.state,
      mode === "cancel" ? "cancelled" : "failed",
    );
    maintain(db, 8 * 86400000);
    assert.throws(() => execution(db, user, id));
    db.close();
  }
});
