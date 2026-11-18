/** Stand-in for the calling application's document store during local acceptance.
 * A second delivery increments the receipt count, while the business transition is unique. */
import { DatabaseSync } from "node:sqlite";
import { transaction } from "./db.mjs";
export function receiverStore(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,reference TEXT,received INTEGER,calls INTEGER DEFAULT 1);
 CREATE TABLE IF NOT EXISTS completions(reference TEXT PRIMARY KEY,notification TEXT UNIQUE REFERENCES receipts(id) ON DELETE CASCADE,completed INTEGER NOT NULL);`);
  return db;
}
export function receive(db, id, body, now = Date.now()) {
  const reference =
    typeof body?.reference === "string" &&
    /^[a-f0-9-]{36}$/.test(body.reference)
      ? body.reference
      : null;
  transaction(db, () => {
    db.prepare("DELETE FROM receipts WHERE received<?").run(now - 7 * 86400000);
    db.prepare(
      "INSERT INTO receipts(id,reference,received) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET calls=calls+1",
    ).run(id, reference, now);
    if (reference && body.etat === "success")
      db.prepare("INSERT OR IGNORE INTO completions VALUES(?,?,?)").run(
        reference,
        id,
        now,
      );
  });
}
