/** Shared contract for the browser preview, publication and HTTP runtime. */
import { z } from "zod";

export const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const jsonTypes = [
  "uuid",
  "integer",
  "string",
  "boolean",
  "decimal",
  "null",
] as const;
const variable = z.object({
  name: z.string(),
  type: z.enum(jsonTypes),
  mode: z.enum(["fixed", "generate", "input"]),
  value: z.string(),
  min: z.number(),
  max: z.number(),
  length: z.number(),
  alphabet: z.string(),
  prefix: z.string(),
  source: z.string(),
});
export const draftSchema = z.object({
  name: z.string().max(160),
  project: z.string().min(1).max(80),
  environment: z.string().max(80).optional(),
  service: z.string().max(100),
  description: z.string().max(1600),
  tags: z.array(z.string().max(64)).max(20),
  method: z.enum(methods),
  path: z.string().max(512),
  status: z.number(),
  contentType: z.enum([
    "application/json",
    "application/problem+json",
    "text/plain",
  ]),
  noBody: z.boolean(),
  body: z.string().max(32768),
  headers: z.string().max(4096),
  variables: z.array(variable).max(40),
  webhook: z.boolean(),
  destination: z.string().max(120),
  delay: z.number(),
  hookBody: z.string().max(32768),
  hookHeaders: z.string().max(4096),
  expected: z.string().max(1500),
  sha: z.string().max(80),
});
export type Draft = z.infer<typeof draftSchema>;
export type Variable = Draft["variables"][number];
export type Value = null | boolean | number | string;
export const newVariable = (): Variable => ({
  name: "reference",
  type: "uuid",
  mode: "generate",
  value: "",
  min: 1,
  max: 100,
  length: 8,
  alphabet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  prefix: "",
  source: "",
});
export const blank = (project: string): Draft => ({
  name: "",
  project,
  service: "",
  description: "",
  tags: [],
  method: "POST",
  path: "/resources",
  status: 200,
  contentType: "application/json",
  noBody: false,
  body: '{\n  "ok": true\n}',
  headers: "{}",
  variables: [],
  webhook: false,
  destination: "",
  delay: 120,
  hookBody: "{}",
  hookHeaders: "{}",
  expected: "",
  sha: "",
});
export class FieldError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}
function fail(field: string, message: string): never {
  throw new FieldError(field, message);
}
function parse(raw: string, field: string) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fail(field, "JSON invalide. " + (e as Error).message);
  }
}
const ref = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
const sensitive =
  /authorization|cookie|secret|password|passphrase|credential|token|api.?key|private.?key/i;
export const secretKey = (key: string) => sensitive.test(key);
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function typed(value: unknown, v: Variable, field: string): Value {
  const ok =
    v.type === "null"
      ? value === null
      : v.type === "integer"
        ? Number.isSafeInteger(value)
        : v.type === "decimal"
          ? typeof value === "number" && Number.isFinite(value)
          : v.type === "uuid"
            ? typeof value === "string" && uuid.test(value)
            : typeof value === v.type;
  if (!ok) fail(field, `« ${v.name} » attend une valeur de type ${v.type}.`);
  return value as Value;
}
function resolveVariable(
  v: Variable,
  input: Record<string, unknown>,
  field: string,
) {
  if (v.mode !== "generate") {
    const fixed = typed(
      ["string", "uuid"].includes(v.type) ? v.value : parse(v.value, field),
      v,
      field,
    );
    if (v.mode === "input") {
      if (!/^[A-Za-z_][\w]{0,63}$/.test(v.source))
        fail(field, "Indiquez le champ JSON facultatif.");
      if (Object.hasOwn(input, v.source))
        return typed(input[v.source], v, field);
    }
    return fixed;
  }
  if (v.type === "uuid") return crypto.randomUUID();
  if (
    v.type === "integer" &&
    Number.isSafeInteger(v.min) &&
    Number.isSafeInteger(v.max) &&
    v.min <= v.max &&
    v.max - v.min < 2 ** 32
  )
    return v.min + Math.floor(Math.random() * (v.max - v.min + 1));
  if (
    v.type === "string" &&
    Number.isInteger(v.length) &&
    v.length >= 1 &&
    v.length <= 256 &&
    v.alphabet.length &&
    v.alphabet.length <= 256 &&
    v.prefix.length <= 128
  ) {
    const letters = Array.from(v.alphabet);
    return (
      v.prefix +
      Array.from(
        { length: v.length },
        () => letters[Math.floor(Math.random() * letters.length)],
      ).join("")
    );
  }
  return fail(
    field,
    "Vérifiez le type du générateur, ses bornes ou son alphabet.",
  );
}
function render(
  raw: string,
  vars: Record<string, Value>,
  field: string,
  plain = false,
): string {
  // Enforce an expansion budget before concatenating repeated references.
  let expansion = 0;
  function lookup(name: string) {
    if (!Object.hasOwn(vars, name))
      return fail(field, `Variable inconnue : ${name}.`);
    const resolved = vars[name];
    expansion += String(resolved).length;
    if (expansion > 65536) fail(field, "Corps résolu supérieur à 64 Kio.");
    return resolved;
  }
  function visit(value: unknown, depth: number): unknown {
    if (depth > 48) fail(field, "Imbrication excessive.");
    if (typeof value === "string") {
      const exact = /^\{\{(\w+)\}\}$/.exec(value);
      if (exact && !plain) return lookup(exact[1]);
      return value.replace(ref, (_, name) => String(lookup(name)));
    }
    if (Array.isArray(value))
      return value.map((item) => visit(item, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, visit(v, depth + 1)]),
      );
    return value;
  }
  const rendered = plain
    ? String(visit(raw, 0))
    : JSON.stringify(visit(parse(raw, field), 0));
  if (new TextEncoder().encode(rendered).length > 65536)
    fail(field, "Corps résolu supérieur à 64 Kio.");
  return rendered;
}
function headerMap(raw: string, field: string): Record<string, string> {
  const map = parse(raw, field);
  if (!map || Array.isArray(map) || typeof map !== "object")
    fail(field, "Un objet JSON est requis.");
  for (const [k, v] of Object.entries(map)) {
    // Only application metadata is editable. Cookies, redirects and transport headers belong to the server.
    if (
      !/^(?:x-[\w-]{1,80}|retry-after|etag|content-language|last-modified|allow|www-authenticate|ratelimit(?:-limit|-remaining|-reset)?)$/i.test(
        k,
      ) ||
      /^(x-lab-|x-forwarded-|x-middleware-|x-nextjs-|x-matched-path$|x-accel-|x-sendfile$|x-correlation-id$|x-notification-id$)/i.test(
        k,
      ) ||
      secretKey(k) ||
      typeof v !== "string" ||
      !/^[\x20-\x7e]{0,512}$/.test(v)
    )
      fail(
        field,
        `En-tête interdit ou invalide : ${k}. Utilisez un en-tête applicatif autorisé.`,
      );
  }
  return map;
}
export function compile(d: Draft, input: Record<string, unknown> = {}) {
  if (d.sha && !/^[a-f0-9]{7,64}$/i.test(d.sha))
    fail("sha", "Indiquez un SHA hexadécimal (7 à 64 caractères).");
  if (!d.name.trim()) fail("name", "Donnez un nom à la simulation.");
  if (
    !/^\/[A-Za-z0-9._~/-]*$/.test(d.path) ||
    d.path.includes("//") ||
    d.path.split("/").some((segment) => segment === ".." || segment === ".")
  )
    fail("path", "Utilisez un chemin exact commençant par /.");
  if (!Number.isInteger(d.status) || d.status < 200 || d.status > 599)
    fail("status", "Choisissez un statut final de 200 à 599.");
  if ([204, 205, 304].includes(d.status) && !d.noBody)
    fail("noBody", "Ce statut exige une réponse sans corps.");
  const variables: Record<string, Value> = Object.create(null);
  for (const v of d.variables) {
    if (
      !/^[A-Za-z_][\w]{0,63}$/.test(v.name) ||
      Object.hasOwn(variables, v.name)
    )
      fail("variables", "Chaque variable doit avoir un identifiant unique.");
    variables[v.name] = resolveVariable(v, input, "variables");
  }
  const body = d.noBody
    ? null
    : render(d.body, variables, "body", d.contentType === "text/plain");
  const headers = headerMap(d.headers, "headers");
  if (
    d.webhook &&
    (!Number.isInteger(d.delay) || d.delay < 0 || d.delay > 86400)
  )
    fail("delay", "Le délai doit être compris entre 0 et 86 400 secondes.");
  if (d.webhook && !d.destination)
    fail("destination", "Choisissez une destination autorisée.");
  const hook = d.webhook
    ? {
        body: render(d.hookBody, variables, "hookBody"),
        headers: headerMap(d.hookHeaders, "hookHeaders"),
      }
    : null;
  return { variables, body, headers, hook };
}
