import { setTimeout as pause } from "node:timers/promises";
import { openDatabase } from "../src/lab/server/db.mjs";
import { deliverOne, maintain } from "../src/lab/server/outbox.mjs";
const db = openDatabase();
let running = true,
  maintenance = 0;
process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});
while (running) {
  try {
    if (Date.now() - maintenance > 10000) {
      maintain(db);
      maintenance = Date.now();
    }
    if (!(await deliverOne(db))) await pause(300);
  } catch {
    console.error("Worker indisponible, nouvelle lecture dans une seconde.");
    await pause(1000);
  }
}
db.close();
