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
export function bodyTrace(raw) {
  if (raw == null || raw === "") return null;
  try {
    return mask(JSON.parse(raw));
  } catch {
    return "[contenu texte masqué]";
  }
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
