import { secretKey } from "../model.ts";
const pii =
  /email|phone|mobile|address|password|passwd|mot.?de.?passe|iban|card|cvv|signature|session|bearer|credential|national.?id/i;
export function mask(value, depth = 0) {
  if (depth > 8) return "…";
  if (Array.isArray(value))
    return value.slice(0, 25).map((v) => mask(v, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 60)
        .map(([k, v]) => [
          k,
          secretKey(k) || pii.test(k) ? "[masqué]" : mask(v, depth + 1),
        ]),
    );
  if (typeof value === "string")
    return value
      .replace(/\b(?:Bearer|Basic)\s+[^\s,]+/gi, "[masqué]")
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[masqué]")
      .slice(0, 512);
  return value;
}
export function headerTrace(headers) {
  return Object.fromEntries(
    Object.entries(headers)
      .slice(0, 40)
      .map(([k, v]) => [
        k,
        /^(content-type|content-length|accept)$/i.test(k)
          ? mask(v)
          : "[masqué]",
      ]),
  );
}

/** A sensitive input can be renamed or interpolated into any template field.
 * Redact its resolved value before applying truncation to the stored evidence. */
export function traceFilter(definitions, values) {
  const hidden = definitions
    .filter(
      (v) =>
        secretKey(v.name) ||
        pii.test(v.name) ||
        (v.mode === "input" && (secretKey(v.source) || pii.test(v.source))),
    )
    .map((v) => values[v.name]);
  const tokens = hidden
    .filter((v) => typeof v === "string" && v.length)
    .sort((a, b) => b.length - a.length);
  function cleanse(value, depth = 0) {
    if (depth > 8) return "…";
    if (hidden.some((v) => v !== null && v === value)) return "[masqué]";
    if (typeof value === "string") {
      for (const token of tokens) value = value.replaceAll(token, "[masqué]");
      return value;
    }
    if (Array.isArray(value))
      return value.slice(0, 25).map((v) => cleanse(v, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .slice(0, 60)
          .map(([k, v]) => [
            k,
            secretKey(k) || pii.test(k) ? "[masqué]" : cleanse(v, depth + 1),
          ]),
      );
    return value;
  }
  function evidence(value) {
    const safe = mask(cleanse(value)),
      serialized = JSON.stringify(safe);
    return serialized.length > 8192
      ? { tronque: true, extrait: serialized.slice(0, 8192) }
      : safe;
  }
  return {
    evidence,
    body(raw) {
      if (raw === null || raw === "") return null;
      try {
        return evidence(JSON.parse(raw));
      } catch {
        return "[contenu texte masqué]";
      }
    },
  };
}
