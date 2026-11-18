import { SaxesParser } from "saxes";
export function validateXml(raw: string) {
  const parser = new SaxesParser({ xmlns: true });
  parser.on("doctype", () => {
    throw Error("Les déclarations DOCTYPE sont interdites.");
  });
  parser.write(raw).close();
}
export function renderXml(raw: string, resolve: (name: string) => unknown) {
  validateXml(raw);
  // Template values belong in element text or quoted attributes. Keep metadata and CDATA literal.
  let expanded = 0;
  const body = raw.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g,
    (token, name) => {
      if (!name) return token;
      const value = String(resolve(name))
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
      expanded += value.length;
      if (expanded > 65536) throw Error("Corps résolu supérieur à 64 Kio.");
      return value;
    },
  );
  validateXml(body);
  return body;
}
