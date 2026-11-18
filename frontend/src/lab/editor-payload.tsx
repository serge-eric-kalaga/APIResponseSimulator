import { useRef } from "react";
import type { RefObject } from "react";
import { ListTree } from "lucide-react";
import { EditorPanel, EditorTabs } from "./editor-controls";
import type { Draft } from "./model";
import s from "./editor.module.css";

export type Part = "body" | "headers";
type Target = "hookBody" | "body";
export function EditorPayload({
  target,
  part,
  selectPart,
  draft,
  edit,
  bodyRef,
  onBodyFocus,
  disabled,
  insert,
  create,
  indent,
  err,
}: {
  target: Target;
  part: Part;
  selectPart: (part: Part) => void;
  draft: Draft;
  edit: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  onBodyFocus: (target: Target) => void;
  disabled: boolean;
  insert: (name: string, target: Target) => void;
  create: (target: Target) => void;
  indent: (target: Target) => void;
  err: (key: string) => string | undefined;
}) {
  const hook = target === "hookBody";
  const header = hook ? "hookHeaders" : "headers";
  const prefix = hook ? "webhook" : "réponse";
  const label = hook ? "Corps du webhook" : "Corps de la réponse";
  const headerLabel = hook ? "En-têtes POST" : "En-têtes JSON";
  const format =
    hook || draft.contentType.includes("json")
      ? "JSON"
      : draft.contentType.endsWith("/xml")
        ? "XML"
        : "TEXTE";
  const body = draft[target],
    headers = draft[header],
    noBody = !hook && draft.noBody;
  const error = err(part === "body" ? target : header);
  const gutter = useRef<HTMLPreElement>(null);
  const source = part === "body" ? body : headers;
  const prefixId = prefix + "-";
  return (
    <>
      <div className={s.editor}>
        <div className={s.editorBar}>
          <EditorTabs
            compact
            label={"Données " + prefix}
            tabs={[
              { id: prefixId + "body", label: "Corps" },
              { id: prefixId + "headers", label: "En-têtes" },
            ]}
            value={prefixId + part}
            select={(id) =>
              selectPart(id === prefixId + "body" ? "body" : "headers")
            }
          />
          <span>{part === "headers" ? "JSON" : format}</span>
        </div>
        {(["body", "headers"] as const).map((kind) => (
          <EditorPanel
            key={kind}
            id={prefixId + kind}
            selected={prefixId + part}
          >
            {kind === "body" && noBody ? (
              <p className={s.empty}>Réponse sans corps.</p>
            ) : (
              <div className={s.source}>
                <pre
                  ref={part === kind ? gutter : undefined}
                  aria-hidden="true"
                >
                  {part === kind &&
                    source
                      .split("\n")
                      .map((_, i) => i + 1)
                      .join("\n")}
                </pre>
                <textarea
                  ref={kind === "body" ? bodyRef : undefined}
                  wrap="off"
                  spellCheck={false}
                  disabled={disabled}
                  aria-label={kind === "body" ? label : headerLabel}
                  aria-invalid={part === kind && !!error}
                  aria-describedby={
                    part === kind && error ? prefixId + "error" : undefined
                  }
                  value={kind === "body" ? body : headers}
                  onFocus={
                    kind === "body" ? () => onBodyFocus(target) : undefined
                  }
                  onChange={(e) =>
                    edit(kind === "body" ? target : header, e.target.value)
                  }
                  onScroll={(e) => {
                    if (gutter.current)
                      gutter.current.scrollTop = e.currentTarget.scrollTop;
                  }}
                />
              </div>
            )}
          </EditorPanel>
        ))}
        {part === "body" && !noBody && (
          <div className={s.editorFoot}>
            {format === "JSON" && (
              <button
                disabled={disabled}
                className={s.text}
                aria-label="Indenter le JSON"
                onClick={() => indent(target)}
              >
                <ListTree size={15} />
                Indenter
              </button>
            )}
            <select
              disabled={disabled}
              aria-label={"Insérer une variable dans " + label}
              value=""
              onChange={(e) =>
                e.target.value === "@create"
                  ? create(target)
                  : insert(e.target.value, target)
              }
            >
              <option value="">Insérer une variable…</option>
              {draft.variables.map((v, i) => (
                <option key={i} value={v.name}>
                  {v.name}
                </option>
              ))}
              <option value="@create">Créer une variable…</option>
            </select>
          </div>
        )}
      </div>
      {error && (
        <p id={prefixId + "error"} className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
