"use client";
import { useState } from "react";
import { CalendarDays, ChevronRight, Inbox, Search } from "lucide-react";
import { stateName } from "./client";
import type { Run } from "./client";
import s from "./monitoring.module.css";

const utcDay = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  dateStyle: "short",
});
const utcTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "UTC",
  timeStyle: "medium",
});
const states = [
  "pending",
  "sending",
  "retry",
  "delivered",
  "failed",
  "cancelled",
];
const tones: Record<string, string> = {
  pending: s.amber,
  sending: s.amber,
  retry: s.amber,
  failed: s.red,
  delivered: s.green,
};
const fold = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");

function JournalRow({ run }: { run: Run }) {
  const stamp = new Date(run.received);
  return (
    <a className={s.runRow} href={"#/runs/" + run.id}>
      <time className={s.callTime} dateTime={stamp.toISOString()}>
        {utcTime.format(stamp)}
      </time>
      <span className={s.identity}>
        <strong>{run.name}</strong>
        <small>
          {run.project} · v{run.version}
        </small>
      </span>
      <span
        className={s.http + " " + (run.status < 400 ? s.ok : s.refusal)}
        aria-label={"HTTP " + run.status}
      >
        <b className={s.dot} />
        {run.status}
      </span>
      <span className={s.hookState}>
        {run.state && (
          <b className={s.dot + " " + (tones[run.state] || s.none)} />
        )}
        {stateName(run.state)}
      </span>
      <ChevronRight className={s.rowArrow} size={14} />
    </a>
  );
}

export function History({
  rows,
  project,
  resetProject,
}: {
  rows: Run[];
  project: string;
  resetProject: () => void;
}) {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [hook, setHook] = useState(""),
    [day, setDay] = useState("");
  const dates = new Set<string>(),
    groups = new Map<string, Run[]>();
  const query = fold(search.trim());
  let count = 0;
  // The API returns the most recent calls first. Group by UTC so filters and displayed times agree across locales.
  for (const run of rows) {
    if (project && run.project !== project) continue;
    const key = new Date(run.received).toISOString().slice(0, 10);
    dates.add(key);
    if (
      (day && day !== key) ||
      !String(run.status).startsWith(status) ||
      (hook && hook !== (run.state ?? "none")) ||
      !fold(run.name).includes(query)
    )
      continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(run);
    else groups.set(key, [run]);
    count++;
  }
  if (day) dates.add(day); // Keep the selected date available while the journal refreshes.
  function reset() {
    setSearch("");
    setStatus("");
    setHook("");
    setDay("");
    resetProject();
  }
  return (
    <div className={s.page}>
      <header className={s.pageHead}>
        <h1>Exécutions</h1>
      </header>
      <section aria-labelledby="journal-title">
        <div className={s.sectionHeading}>
          <h2 id="journal-title">Journal des appels</h2>
          <label className={s.quietSelect}>
            <CalendarDays size={16} />
            <select
              aria-label="Période"
              value={day}
              onChange={(e) => setDay(e.target.value)}
            >
              <option value="">Toutes les dates</option>
              {Array.from(dates).map((key) => (
                <option key={key} value={key}>
                  {shortDate.format(new Date(key))}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={s.tools}>
          <label className={s.search}>
            <Search size={17} />
            <input
              type="search"
              aria-label="Rechercher une simulation"
              placeholder="Rechercher une simulation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className={s.select}>
            Code HTTP
            <select
              aria-label="Code HTTP"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Tous</option>
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}xx
                </option>
              ))}
            </select>
          </label>
          <label className={s.select}>
            Webhook
            <select
              aria-label="Webhook"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
            >
              <option value="">Tous</option>
              {states.map((key) => (
                <option key={key} value={key}>
                  {stateName(key)}
                </option>
              ))}
              <option value="none">Sans webhook</option>
            </select>
          </label>
        </div>
        <p className={s.listMeta} role="status">
          {count} appel{count > 1 ? "s" : ""}
          {rows.length === 250 && " · sur les 250 appels les plus récents"}
        </p>
        {Array.from(groups, ([key, list]) => (
          <section className={s.day} key={key}>
            <div className={s.dayHead}>
              <h3>{utcDay.format(list[0].received)}</h3>
              <span>Heure UTC</span>
            </div>
            <div className={s.columnHead} aria-hidden="true">
              <span>Heure</span>
              <span>Simulation</span>
              <span>HTTP</span>
              <span>Webhook</span>
            </div>
            {list.map((run) => (
              <JournalRow key={run.id} run={run} />
            ))}
          </section>
        ))}
        {!count && (
          <div className={s.empty}>
            <Inbox size={20} />
            <h3>{rows.length ? "Aucun appel trouvé" : "Aucun appel reçu"}</h3>
            {project || day || search || status || hook ? (
              <button className={s.linkButton} onClick={reset}>
                Effacer les filtres
              </button>
            ) : (
              <a className={s.linkButton} href="#/library">
                Ouvrir la bibliothèque
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
