import { Clipboard, History, Play } from "lucide-react";
import { pretty, urlFor } from "./client";
import type { Item, Version } from "./client";
import type { Draft, compile } from "./model";
import { jsonLine } from "./json-line";
import s from "./editor.module.css";

export function previewText(draft: Draft, body: string | null) {
  if (body === null) return "(sans corps)";
  return draft.contentType.includes("json") ? pretty(JSON.parse(body)) : body;
}

export function EditorPreview({
  draft,
  preview,
  error,
  item,
  version,
  active,
  raw,
  setRaw,
  busy,
  run,
  history,
  notify,
  sheet,
}: {
  draft: Draft;
  preview?: ReturnType<typeof compile>;
  error?: string;
  item?: Item;
  version?: Version;
  active: number;
  raw: string;
  setRaw: (raw: string) => void;
  busy: boolean;
  run: () => void;
  history: () => void;
  notify: (text: string) => void;
  sheet?: boolean;
}) {
  const endpoint = item && version ? urlFor(item.id, version.config.path) : "";
  const body = preview ? previewText(draft, preview.body) : error;
  const headers = preview && Object.entries(preview.headers);
  return (
    <>
      {!sheet && <h2>Aperçu du brouillon</h2>}
      <div className={s.preview} aria-label="Réponse du brouillon">
        <div className={s.previewBar}>
          <b>{preview ? "HTTP " + draft.status : "Aperçu indisponible"}</b>
          <span>{draft.noBody ? "sans corps" : draft.contentType}</span>
        </div>
        <pre>
          {body && preview && draft.contentType.includes("json")
            ? jsonLine(body)
            : body}
        </pre>
        {!!headers?.length && (
          <details>
            <summary>En-têtes de réponse</summary>
            <pre>{headers.map(([k, v]) => k + ": " + v).join("\n")}</pre>
          </details>
        )}
      </div>
      <section className={s.active}>
        <div className={s.sectionHead}>
          <h2>Version publiée</h2>
          {version && (
            <button className={s.text} onClick={history}>
              Historique <History size={15} />
            </button>
          )}
        </div>
        {!active ? (
          <p className={s.muted}>Aucune version publiée.</p>
        ) : version ? (
          <>
            <div className={s.route}>
              <b>{version.config.method}</b>
              <code>{version.config.path}</code>
            </div>
            {!!item?.writable && !item.archived && (
              <>
                <div className={s.buttons}>
                  <button
                    className="btn"
                    disabled={busy}
                    aria-label={"Exécuter la version v" + active}
                    onClick={run}
                  >
                    <Play />
                    Tester v{active}
                  </button>
                  <button
                    className={s.text}
                    onClick={async () => {
                      const cmd =
                        "curl -X " +
                        version.config.method +
                        " '" +
                        endpoint +
                        '\' -H "X-Lab-Key: $RELAIS_TEST_KEY"';
                      try {
                        await navigator.clipboard.writeText(cmd);
                        notify("Commande cURL copiée.");
                      } catch {
                        notify("Copie indisponible.");
                      }
                    }}
                  >
                    <Clipboard size={15} />
                    Copier le cURL
                  </button>
                </div>
                <details className={s.more}>
                  <summary>Détails de l’appel test</summary>
                  <code className="wrap">{endpoint}</code>
                  <label className="field">
                    Requête JSON de test
                    <textarea
                      value={raw}
                      onChange={(e) => setRaw(e.target.value)}
                    />
                  </label>
                </details>
              </>
            )}
          </>
        ) : (
          <p className={s.muted}>Version v{active}</p>
        )}
      </section>
    </>
  );
}
