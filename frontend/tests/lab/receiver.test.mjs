import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  receive,
  receiverStore,
} from "../../src/lab/server/pilot-receipts.mjs";
test("receipt and application transition remain idempotent across deliveries", () => {
  const db = receiverStore(":memory:"),
    ref = randomUUID(),
    id = randomUUID(),
    body = { reference: ref, etat: "success" };
  receive(db, id, body);
  receive(db, id, body);
  assert.equal(
    db.prepare("SELECT calls FROM receipts WHERE id=?").get(id).calls,
    2,
  );
  assert.equal(
    db.prepare("SELECT count(*) n FROM completions WHERE reference=?").get(ref)
      .n,
    1,
  );
  db.close();
});
