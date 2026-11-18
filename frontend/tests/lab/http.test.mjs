import test from "node:test";
import assert from "node:assert/strict";
import { administration, simulate } from "../../src/lab/server/http.mjs";
import { openDatabase } from "../../src/lab/server/db.mjs";
import { createProject } from "../../src/lab/server/access.mjs";
import { blank } from "../../src/lab/model.ts";
test("HTTP boundary: cookie, cross-origin writes, publication, trigger and errors", async () => {
  const db = openDatabase(":memory:"),
    key = createProject(db, "QA");
  const req = (path, body, headers = {}) =>
    new Request("http://localhost/" + path, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  assert.equal(
    (await administration(req("workspace"), ["workspace"], db)).status,
    401,
  );
  const keyLogin = await administration(req("login", { key }), ["login"], db);
  assert.equal(keyLogin.status, 422);
  assert.equal(keyLogin.headers.get("set-cookie"), null);
  const credentials = { email: "qa@example.test", password: "recette-console" };
  assert.equal(
    (await administration(req("register", credentials), ["register"], db))
      .status,
    200,
  );
  db.prepare("INSERT INTO grants VALUES(?,?)").run(credentials.email, "QA");
  const login = await administration(req("login", credentials), ["login"], db);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const removed = await administration(
    req("migrate", credentials, { cookie }),
    ["migrate"],
    db,
  );
  assert.equal(removed.status, 404);
  assert.equal(removed.headers.get("set-cookie"), null);
  const data = {
    draft: { ...blank("QA"), name: "Sans corps", status: 204, noBody: true },
    publish: true,
  };
  assert.equal(
    (
      await administration(
        req("scenarios", data, { cookie, origin: "https://wrong.test" }),
        ["scenarios"],
        db,
      )
    ).status,
    403,
  );
  const s = await (
    await administration(req("scenarios", data, { cookie }), ["scenarios"], db)
  ).json();
  const response = await simulate(
    req("match", {}, { "x-lab-key": key }),
    s.id,
    "/resources",
    db,
  );
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.ok(response.headers.get("x-correlation-id"));
  assert.equal(
    (
      await simulate(
        req("miss", {}, { "x-lab-key": key }),
        s.id,
        "/unknown",
        db,
      )
    ).headers.get("x-lab-error"),
    "1",
  );
  assert.equal(
    (
      await simulate(
        req("large", { a: "x".repeat(70000) }),
        s.id,
        "/resources",
        db,
      )
    ).status,
    413,
  );
  const ws = await (
    await administration(req("workspace", null, { cookie }), ["workspace"], db)
  ).json();
  assert.equal(ws.items[0].activePath, "/resources");
  assert.equal(ws.runs.length, 1);
  db.close();
});
