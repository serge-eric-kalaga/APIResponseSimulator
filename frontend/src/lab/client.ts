import type { Draft } from "./model";
export type Item = {
  id: string;
  project: string;
  draft: Draft;
  active: number;
  activePath: string | null;
  archived: number;
  environment: string;
  environmentName: string;
  writable: number;
  updated: number;
  revision: number;
};
export type Run = {
  id: string;
  sim: string;
  version: number;
  received: number;
  name: string;
  status: number;
  project: string;
  state: string | null;
};
export type Job = {
  replayed: number | null;
  after_attempt: number | null;
  id: string;
  dest: string;
  planned: number;
  due: number;
  state: string;
  count: number;
};
export type Trace = {
  name: string;
  project: string;
  method: string;
  path: string;
  status: number;
  expected: string;
  sha: string;
  variables: unknown;
  incoming: unknown;
  requestHeaders: unknown;
  response: unknown;
  responseHeaders: unknown;
  webhook: unknown;
  hookHeaders: unknown;
};
export type Proof = {
  id: string;
  sim: string;
  version: number;
  received: number;
  trace: Trace;
  job: Job | null;
  attempts: {
    number: number;
    started: number;
    finished: number | null;
    code: number | null;
    outcome: string;
  }[];
};
export type Destination = {
  id: string;
  label: string;
  url: string;
  status: string;
  environmentId?: string;
  projects: string[];
};
export type Workspace = {
  user: { name: string; projects: string[] };
  environments: {
    id: string;
    project: string;
    name: string;
    writable: number;
    primary_env: number;
  }[];
  items: Item[];
  runs: Run[];
  runCounts: { project: string; total: number }[];
  destinations: Destination[];
  receiverReview: {
    id: string;
    url: string;
    status: string;
    environmentName: string;
    project: string;
  }[];
  health: {
    waiting: number;
    delivered: number;
    failed: number;
    lag: number;
    configErrors: number;
    online: boolean;
    heartbeat: number | null;
  };
};
export type Version = { number: number; published: number; config: Draft };
export class RequestError extends Error {
  status: number;
  field?: string;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const r = await fetch("/api/lab/" + path, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await r.json();
  if (!r.ok)
    throw new RequestError(
      r.status,
      value.error || "Opération impossible.",
      value.field,
    );
  return value;
}
export const utc = (t: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(t) + " UTC";
export const pretty = (x: unknown) => JSON.stringify(x, null, 2);
export const urlFor = (id: string, path: string) =>
  `${window.location.origin}/simulate/${id}${path}`;
export const stateName = (s: string | null) =>
  ({
    pending: "Planifié",
    sending: "Envoi en cours",
    retry: "Nouvel essai",
    delivered: "Livré",
    failed: "Échec",
    cancelled: "Annulé",
  })[s || ""] || "Sans webhook";
export const itemState = (i: Item) =>
  i.archived ? "Archivée" : i.active ? "Active" : "Brouillon";

/** Fragment links remain shareable without a server navigation. */
export function navigate(fragment: string) {
  window.location.hash = fragment;
}
