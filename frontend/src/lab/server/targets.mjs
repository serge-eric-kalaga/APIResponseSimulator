import {readFileSync} from "node:fs";
import {isIPv4} from "node:net";
import {Problem} from "./db.mjs";
export const pilotUrl = "http://127.0.0.1:3922/recette";
export function destinations() {
  const file = process.env.RELAIS_DESTINATIONS;
  return file ? JSON.parse(readFileSync(file,"utf8")) : [];
}
/** A controlled loopback receiver is the sole HTTP exception. Other entries require
 * an exact HTTPS URL + a static public IPv4 pinned by the test environment owner. */
export function target(id, project, snapshot, entries=destinations()) {
  const entry = entries.find(e=>e.id===id && e.projects.includes(project));
  if (!entry || (snapshot && entry.url!==snapshot)) throw new Problem(422,"Destination indisponible pour ce projet.");
  if (entry.pilot === true && entry.url === pilotUrl) return entry;
  const url = new URL(entry.url);
  const parts = String(entry.ip).split(".").map(Number);
  const [a,b,c] = parts;
  const reserved = a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) ||
    (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0 || (b===88 && c===99))) ||
    (a===198 && (b===18 || b===19 || b===51 && c===100)) || (a===203 && b===0 && c===113);
  if (entry.environment!=="test" || url.protocol!=="https:" || url.username || url.password || url.hash || url.search ||
      !isIPv4(entry.ip) || reserved || !/^[a-z][a-z0-9.-]*\.[a-z]{2,}$/i.test(url.hostname))
    throw new Problem(422,"La destination doit être un service HTTPS de test approuvé à adresse publique fixe.");
  return entry;
}
