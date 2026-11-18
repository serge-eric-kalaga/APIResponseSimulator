import {
  applyEdits,
  findNodeAtOffset,
  format,
  getNodePath,
  modify,
  parseTree,
} from "jsonc-parser";
import { validateXml } from "./xml.ts";
const options = { insertSpaces: true, tabSize: 2, eol: "\n" };
const valid = (s: string) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};
function formatJson(s: string) {
  return applyEdits(s, format(s, undefined, options));
}

/** Only recover the exact legacy shape produced by inserting value tokens as object keys.
 * Other invalid drafts are preserved so the author can finish or correct them. */
function recover(raw: string) {
  if (!/^\s*\{\s*(?:"\{\{[A-Za-z_]\w*\}\}"\s*)+\}\s*$/.test(raw)) return raw;
  return JSON.stringify(
    Object.fromEntries(
      [...raw.matchAll(/"\{\{(\w+)\}\}"/g)].map(([, n]) => [
        n,
        "{{" + n + "}}",
      ]),
    ),
  );
}
export function indentJson(raw: string) {
  const s = recover(raw);
  JSON.parse(s);
  return formatJson(s);
}
export function insertVariable(
  raw: string,
  name: string,
  start: number,
  end: number,
  kind: "json" | "xml" | "text",
) {
  if (!/^[A-Za-z_]\w*$/.test(name))
    throw Error("Donnez un nom valide à la variable avant de l’insérer.");
  const token = "{{" + name + "}}";
  const splice = (text: string) => raw.slice(0, start) + text + raw.slice(end);
  if (kind === "text")
    return { body: splice(token), cursor: start + token.length };
  if (kind === "xml") {
    if (!raw.trim()) return { body: `<${name}>${token}</${name}>`, cursor: 0 };
    const candidate = splice(token);
    try {
      validateXml(candidate);
      return { body: candidate, cursor: start + token.length };
    } catch {}
    const element = `<${name}>${token}</${name}>`;
    const body = raw.replace(/(<\/[^>]+>)(\s*)$/, element + "$1$2");
    if (body === raw)
      throw Error(
        "Placez le curseur dans un élément ou dans la valeur d’un attribut XML.",
      );
    validateXml(body);
    return { body, cursor: body.lastIndexOf(element) + element.length };
  }
  const source = recover(raw.trim() ? raw : "{}");
  const root = parseTree(source);
  const node = root && findNodeAtOffset(root, start);
  const isKey =
    node?.parent?.type === "property" && node.parent.children?.[0] === node;
  // In a selected value or inside a string, preserve the author's exact target.
  if (source === raw && !isKey) {
    const inside =
      node?.type === "string" &&
      start > node.offset &&
      end < node.offset + node.length;
    const text = inside ? token : JSON.stringify(token),
      candidate = splice(text);
    if ((inside || start !== end || !valid(source)) && valid(candidate))
      return { body: candidate, cursor: start + text.length };
  }
  if (!root || !valid(source))
    throw Error(
      "Corrigez le JSON ou sélectionnez la valeur à remplacer avant l’insertion.",
    );
  let parent = node || root;
  while (parent.parent && parent.type !== "object" && parent.type !== "array")
    parent = parent.parent;
  if (parent.type !== "object" && parent.type !== "array")
    throw Error("Sélectionnez la valeur JSON à remplacer.");
  if (
    parent.type === "object" &&
    parent.children?.some((p) => p.children?.[0].value === name)
  )
    throw Error(
      "Ce champ existe déjà. Sélectionnez sa valeur pour la remplacer.",
    );
  const path = [...getNodePath(parent), parent.type === "array" ? -1 : name];
  const body = formatJson(
    applyEdits(
      source,
      modify(source, path, token, { formattingOptions: options }),
    ),
  );
  return {
    body,
    cursor:
      body.lastIndexOf(JSON.stringify(token)) + JSON.stringify(token).length,
  };
}
