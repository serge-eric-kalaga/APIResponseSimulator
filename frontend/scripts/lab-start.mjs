/** Starts the complete loopback pilot, including the independent outbox and receiver. */
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("..", import.meta.url));
const home = resolve(process.env.RELAIS_HOME || resolve(cwd, "../data"));
const env = {
  ...process.env,
  RELAIS_HOME: home,
  RELAIS_DB: process.env.RELAIS_DB || resolve(home, "relais.sqlite"),
  RELAIS_DESTINATIONS:
    process.env.RELAIS_DESTINATIONS || resolve(home, "destinations.json"),
  RELAIS_RECEIVER_DB:
    process.env.RELAIS_RECEIVER_DB || resolve(home, "receiver.sqlite"),
};
const result = spawnSync(process.execPath, ["scripts/lab-admin.mjs", "init"], {
  cwd,
  env,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(1);
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const args of [
  ["scripts/lab-receiver.mjs"],
  ["scripts/lab-worker.mjs"],
  [
    "node_modules/next/dist/bin/next",
    process.argv.includes("--prod") ? "start" : "dev",
    "--hostname",
    process.env.RELAIS_BIND || "127.0.0.1",
    "--port",
    process.env.PORT || "3210",
  ],
]) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
