/** Dedicated loopback-only QA dependency. Record receipt by idempotency key, without payload logs. */
import { createServer } from "node:http";
import { openDatabase } from "../src/lab/server/db.mjs";
import { resolve } from "node:path";
const db = openDatabase(
  process.env.RELAIS_RECEIVER_DB || resolve("../data/receiver.sqlite"),
);
db.exec(
  "CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, reference TEXT, received INTEGER, calls INTEGER DEFAULT 1)",
);
createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/recette") {
    res.writeHead(404).end();
    return;
  }
  try {
    const id = req.headers["idempotency-key"];
    if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) {
      res.writeHead(400).end();
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 65536) {
        res.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const ref =
      typeof body?.reference === "string" &&
      /^[a-f0-9-]{36}$/.test(body.reference)
        ? body.reference
        : null;
    db.prepare("DELETE FROM receipts WHERE received<?").run(
      Date.now() - 7 * 86400000,
    );
    db.prepare(
      "INSERT INTO receipts(id,reference,received) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET calls=calls+1",
    ).run(id, ref, Date.now());
    res.writeHead(204).end();
  } catch {
    res.writeHead(400).end();
  }
}).listen(3922, "127.0.0.1", () =>
  console.log("Récepteur de recette sur 127.0.0.1:3922"),
);
