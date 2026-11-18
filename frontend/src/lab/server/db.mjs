import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function openDatabase(
  file = process.env.RELAIS_DB || resolve("..", "data", "relais.sqlite"),
) {
  if (file !== ":memory:")
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS projects(name TEXT PRIMARY KEY, key_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts(name TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS passwords(login TEXT PRIMARY KEY REFERENCES accounts(name), email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, verifier TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS grants(login TEXT REFERENCES accounts(name), project TEXT REFERENCES projects(name),
      PRIMARY KEY(login,project));
    CREATE TABLE IF NOT EXISTS sharing(kind TEXT NOT NULL, resource TEXT NOT NULL, recipient TEXT NOT NULL, PRIMARY KEY(kind,resource,recipient));
    CREATE TABLE IF NOT EXISTS operators(login TEXT PRIMARY KEY REFERENCES accounts(name));
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, login TEXT REFERENCES accounts(name), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sims(id TEXT PRIMARY KEY, project TEXT REFERENCES projects(name), draft TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS versions(sim TEXT REFERENCES sims(id), number INTEGER, config TEXT NOT NULL,
      published INTEGER NOT NULL, PRIMARY KEY(sim,number));
    CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, sim TEXT NOT NULL, version INTEGER NOT NULL, received INTEGER NOT NULL,
      trace TEXT NOT NULL, FOREIGN KEY(sim,version) REFERENCES versions(sim,number));
    CREATE INDEX IF NOT EXISTS runs_time ON runs(received);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, run TEXT UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
      dest TEXT NOT NULL, url TEXT NOT NULL, payload TEXT NOT NULL, headers TEXT NOT NULL, planned INTEGER NOT NULL,
      due INTEGER NOT NULL, state TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, lease TEXT, until INTEGER);
    CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state,due);
    CREATE TABLE IF NOT EXISTS attempts(job TEXT REFERENCES jobs(id) ON DELETE CASCADE, number INTEGER, started INTEGER NOT NULL,
      finished INTEGER, code INTEGER, outcome TEXT NOT NULL, PRIMARY KEY(job,number));
    CREATE TABLE IF NOT EXISTS replays(job TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, requested INTEGER NOT NULL, after_attempt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY, window INTEGER NOT NULL, hits INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS worker_status(id INTEGER PRIMARY KEY CHECK(id=1), seen INTEGER);
  `);
  // Hold the writer lock across detection and conversion: the web and worker may start together.
  transaction(db, () => {
    const legacy = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='environments'",
      )
      .get();
    if (legacy) db.exec("ALTER TABLE receivers RENAME TO legacy_receivers");
    db.exec(`CREATE TABLE IF NOT EXISTS receivers(id TEXT PRIMARY KEY, project TEXT NOT NULL REFERENCES projects(name),
      url TEXT NOT NULL, status TEXT NOT NULL, ip TEXT);
      CREATE INDEX IF NOT EXISTS receivers_project_url ON receivers(project,url);`);
    if (legacy) migrateEnvironments(db);
  });
  return db;
}
/** Preserve per-simulation readership and receiver IDs (including queued deliveries).
 * An old environment invitation must never expose other simulations in the project. */
function migrateEnvironments(db) {
  db.exec(`
    INSERT OR IGNORE INTO sharing(kind,resource,recipient)
      SELECT 'simulation',s.id,h.recipient FROM sharing h
      JOIN environments e ON h.kind='environment' AND h.resource=e.id
      JOIN sims s ON s.project=e.project AND
        (json_extract(s.draft,'$.environment')=e.id OR
         (json_extract(s.draft,'$.environment') IS NULL AND e.primary_env=1));
    DELETE FROM sharing WHERE kind='environment';
    INSERT INTO receivers(id,project,url,status,ip)
      SELECT r.id,e.project,r.url,r.status,r.ip FROM legacy_receivers r JOIN environments e ON e.id=r.environment;
    UPDATE sims SET draft=json_remove(draft,'$.environment') WHERE json_type(draft,'$.environment') IS NOT NULL;
    UPDATE versions SET config=json_remove(config,'$.environment') WHERE json_type(config,'$.environment') IS NOT NULL;
    DROP TRIGGER IF EXISTS project_environment;
    DROP TABLE legacy_receivers;
    DROP TABLE environments;`);
}
let singleton;
export function database() {
  return (singleton ??= openDatabase());
}

/** SQLite's writer lock serializes version increments, quota checks and job claims across processes. */
export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function limit(db, bucket, max, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  const { hits } = db
    .prepare(
      `INSERT INTO limits VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET
    hits=CASE WHEN window=excluded.window THEN hits+1 ELSE 1 END,window=excluded.window RETURNING hits`,
    )
    .get(bucket, minute);
  if (hits > max) throw new Problem(429, "Limite de fréquence atteinte.");
}
export class Problem extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
