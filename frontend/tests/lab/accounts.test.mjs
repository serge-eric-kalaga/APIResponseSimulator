import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccount,
  createProject,
  identity,
  signIn,
} from "../../src/lab/server/access.mjs";
import { openDatabase } from "../../src/lab/server/db.mjs";
import { enroll, passwordLogin } from "../../src/lab/server/passwords.mjs";
test("public registration, password login and migration isolate existing projects", async () => {
  const db = openDatabase(":memory:");
  try {
    createProject(db, "Atlas");
    const key = createAccount(db, "Pilote", ["Atlas"]);
    const input = { email: "  A@Example.test ", password: "secret-de-test" };
    const session = await enroll(db, input);
    assert.deepEqual(identity(db, session).projects, []);
    assert.equal(
      identity(db, await passwordLogin(db, input)).name,
      "a@example.test",
    );
    await assert.rejects(enroll(db, input), (e) => e.status === 409);
    await assert.rejects(
      passwordLogin(db, { ...input, password: "incorrect" }),
      (e) => e.status === 401,
    );
    const legacy = {
      email: "pilote@example.test",
      password: "nouveau-secret",
      key,
    };
    const upgraded = await enroll(db, legacy, true);
    assert.deepEqual(identity(db, upgraded).projects, ["Atlas"]);
    assert.throws(() => signIn(db, key));
    await assert.rejects(
      enroll(db, { ...legacy, email: "autre@example.test" }, true),
    );
    assert.equal(identity(db, await passwordLogin(db, legacy)).name, "Pilote");
  } finally {
    db.close();
  }
});
