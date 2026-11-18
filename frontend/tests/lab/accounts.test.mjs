import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccount,
  createProject,
  identity,
} from "../../src/lab/server/access.mjs";
import { openDatabase } from "../../src/lab/server/db.mjs";
import { enroll, passwordLogin } from "../../src/lab/server/passwords.mjs";
test("public registration, password login and profile names isolate existing projects", async () => {
  const db = openDatabase(":memory:");
  try {
    createProject(db, "Atlas");
    createAccount(db, "Pilote", ["Atlas"]);
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
    for (const [firstName, lastName] of [
      ["Awa", "Traoré"],
      ["Awa", ""],
      ["", "Pilote"],
    ]) {
      const email = `membre${firstName.length}${lastName.length}@example.test`;
      await enroll(db, {
        ...input,
        email,
        firstName: " " + firstName + " ",
        lastName,
      });
      const account = identity(
        db,
        await passwordLogin(db, { ...input, email }),
      );
      assert.deepEqual(account, {
        name: email,
        email,
        firstName,
        lastName,
        projects: [],
      });
    }
    assert.equal(identity(db, session).firstName, "");
    assert.equal(identity(db, session).lastName, "");
    await assert.rejects(
      enroll(db, { ...input, lastName: "x".repeat(101) }),
      (e) => e.status === 422,
    );
    await assert.rejects(
      enroll(db, { ...input, firstName: 42 }),
      (e) => e.status === 422,
    );
  } finally {
    db.close();
  }
});
