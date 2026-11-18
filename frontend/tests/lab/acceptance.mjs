/** Exercise the four seeded contracts and the independent consumer over real HTTP.
 * Results are recorded as ordinary runs in the pilot. This takes about two minutes. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as pause } from "node:timers/promises";
const origin = "http://127.0.0.1:" + (process.env.PORT || "3210"),
  home = resolve(process.env.RELAIS_HOME || "../data");
const access = JSON.parse(
  readFileSync(resolve(home, "acces-pilote.json"), "utf8"),
);
const sha =
  process.env.RELAIS_TESTED_SHA ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const login = await fetch(origin + "/api/lab/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(
    process.env.RELAIS_QA_EMAIL
      ? {
          email: process.env.RELAIS_QA_EMAIL,
          password: process.env.RELAIS_QA_PASSWORD,
        }
      : { key: access.cle_interface },
  ),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie").split(";")[0];
async function api(path, write = false) {
  const r = await fetch(origin + "/api/lab/" + path, {
    method: write ? "POST" : "GET",
    headers: { cookie, "content-type": "application/json" },
    body: write ? "{}" : undefined,
  });
  assert.equal(r.status, 200);
  return r.json();
}
const { items } = await api("workspace"),
  proofs = [];
let asyncProof;
const expectations = [
  ["Génération de document", 202, "pending"],
  ["Validation de ressource", 400, "INVALID_REQUEST"],
  ["Acceptation sans référence", 202, "pending"],
  ["Refus explicite", 422, "refused"],
];
for (const [name, status, expected] of expectations) {
  const s = items.find((i) => i.draft.name === name && !i.archived);
  assert.ok(s, name);
  const response = await fetch(origin + "/simulate/" + s.id + s.activePath, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Lab-Key": access.cles_declenchement[s.project],
      "X-Tested-Sha": sha,
    },
    body: '{"fixture":true}',
  });
  assert.equal(response.status, status);
  const body = await response.json();
  assert.equal(body.etat || body.code, expected);
  if (name === "Acceptation sans référence")
    assert.ok(!Object.hasOwn(body, "reference"));
  const id = response.headers.get("x-correlation-id"),
    run = await api("runs/" + id);
  assert.equal(run.trace.sha, sha);
  assert.ok(run.trace.expected);
  assert.equal(run.version, s.active);
  if (name === "Génération de document") {
    assert.equal(run.job.planned - run.received, 120000);
    assert.equal(run.attempts.length, 0);
    assert.equal(run.trace.webhook.reference, body.reference);
    asyncProof = run;
  } else assert.equal(run.job, null);
  proofs.push({ name, status, id, version: run.version });
}
console.log(
  "Réponses vérifiées. Notification planifiée pour",
  new Date(asyncProof.job.planned).toISOString(),
);
const receiver = new DatabaseSync(
  process.env.RELAIS_RECEIVER_DB || resolve(home, "receiver.sqlite"),
  { readOnly: true },
);
const receipt = () =>
  receiver.prepare("SELECT * FROM receipts WHERE id=?").get(asyncProof.job.id);
assert.equal(receipt(), undefined);
const deadline = asyncProof.job.planned + 5000;
async function waitFor(test, limit) {
  while (Date.now() < limit) {
    const value = await test();
    if (value) return value;
    await pause(200);
  }
  throw Error("Échéance de recette dépassée.");
}
await pause(Math.max(1, asyncProof.job.planned - Date.now() - 1200));
assert.equal(receipt(), undefined, "Envoi anticipé.");
const received = await waitFor(receipt, deadline);
assert.equal(received.reference, asyncProof.trace.variables.reference);
assert.ok(
  received.received >= asyncProof.job.planned && received.received <= deadline,
);
await waitFor(
  async () => (await api("runs/" + asyncProof.id)).job.state === "delivered",
  deadline,
);
await api("runs/" + asyncProof.id + "/replay", true);
await waitFor(() => receipt()?.calls === 2, Date.now() + 5000);
assert.equal(
  receiver
    .prepare("SELECT count(*) n FROM completions WHERE reference=?")
    .get(received.reference).n,
  1,
);
const final = await waitFor(async () => {
  const run = await api("runs/" + asyncProof.id);
  return run.job.state === "delivered" && run;
}, Date.now() + 5000);
assert.deepEqual(
  final.attempts.map((a) => a.code),
  [204, 204],
);
receiver.close();
console.log(
  JSON.stringify(
    {
      sha,
      proofs,
      notification: asyncProof.job.id,
      planned: asyncProof.job.planned,
      observed: received.received,
      delayMs: received.received - asyncProof.received,
      attempts: final.attempts.map((a) => a.code),
      deliveries: 2,
      transitions: 1,
    },
    null,
    2,
  ),
);
