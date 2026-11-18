/** Dedicated loopback-only QA dependency. Record receipt by idempotency key, without payload logs. */
import { createServer } from "node:http";
import { receiverStore, receive } from "../src/lab/server/pilot-receipts.mjs";
import { resolve } from "node:path";
const db = receiverStore(
  process.env.RELAIS_RECEIVER_DB || resolve("../data/receiver.sqlite"),
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
    receive(db, id, body);
    res.writeHead(204).end();
  } catch {
    res.writeHead(400).end();
  }
}).listen(3922, "127.0.0.1", () =>
  console.log("Récepteur de recette sur 127.0.0.1:3922"),
);
