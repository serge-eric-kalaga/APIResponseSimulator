import { Fragment, useId, useRef, useState } from "react";
import { Braces, Copy } from "lucide-react";
import type { Proof } from "./client";
import { pretty } from "./client";
import s from "./trace.module.css";

type View = {
  name: string;
  label: string;
  body: unknown;
  empty?: string;
  json: boolean;
  headers?: Record<string, Record<string, string>>;
};

function viewsFor({ trace: t, job }: Proof): View[] {
  const type = t.responseHeaders["content-type"];
  const json =
    !!type && type.split(";")[0].trim().toLowerCase() === "application/json";
  // Older runs stored both absent bodies and the JSON literal null as null.
  const hasResponse = t.hasResponseBody ?? (t.response !== null || json);
  const hasRequest = t.hasIncomingBody ?? t.incoming !== null;
  const views: View[] = [
    {
      name: "Réponse",
      label: type || "Réponse HTTP",
      body: t.response,
      json,
      empty: hasResponse ? undefined : "Aucun corps servi",
    },
    {
      name: "Requête",
      label: t.method + " " + t.path,
      body: t.incoming,
      json: true,
      empty: hasRequest ? undefined : "Aucun corps reçu",
    },
    {
      name: "Variables",
      label: "Variables résolues",
      body: t.variables,
      json: true,
    },
  ];
  const headers = {
    Réponse: t.responseHeaders,
    Requête: t.requestHeaders,
    ...(job ? { Webhook: t.hookHeaders } : {}),
  } as Record<string, Record<string, string>>;
  views.push({
    name: "En-têtes",
    label: "En-têtes HTTP",
    body: headers,
    json: true,
    headers,
  });
  if (job)
    views.push({
      name: "Webhook",
      label: "Notification préparée",
      body: t.webhook,
      json: true,
    });
  return views;
}

/** Highlight the stored evidence as text. Raw request and response bodies never enter the DOM as markup. */
function jsonLine(line: string) {
  const parts = line.split(/("(?:\\.|[^"\\])*")/g);
  return parts.map((part, i) =>
    i % 2 === 0 ? (
      part
    ) : (
      <span key={i} className={parts[i + 1]?.startsWith(":") ? s.key : s.val}>
        {part}
      </span>
    ),
  );
}

export function TraceInspector({
  proof,
  copy,
}: {
  proof: Proof;
  copy: (text: string) => Promise<void>;
}) {
  const views = viewsFor(proof);
  const [selected, setSelected] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const prefix = useId(),
    view = views[selected];
  const text =
    view.empty ??
    (view.json || typeof view.body !== "string"
      ? pretty(view.body)
      : view.body);
  return (
    <>
      <h2>Inspecteur HTTP</h2>
      <div className={s.tabs} role="tablist" aria-label="Données de la trace">
        {views.map(({ name }, i) => (
          <button
            key={name}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={prefix + "tab" + i}
            role="tab"
            aria-controls={prefix + "panel" + i}
            aria-selected={selected === i}
            tabIndex={selected === i ? 0 : -1}
            onClick={() => setSelected(i)}
            onKeyDown={(event) => {
              const positions: Record<string, number> = {
                ArrowLeft: (i - 1 + views.length) % views.length,
                ArrowRight: (i + 1) % views.length,
                Home: 0,
                End: views.length - 1,
              };
              const next = positions[event.key];
              if (next === undefined) return;
              event.preventDefault();
              setSelected(next);
              refs.current[next]?.focus();
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {views.map((option, i) => (
        <div
          key={option.name}
          id={prefix + "panel" + i}
          role="tabpanel"
          aria-labelledby={prefix + "tab" + i}
          hidden={selected !== i}
          tabIndex={0}
        >
          {selected === i && (
            <>
              <div className={s.editor}>
                <div className={s.file}>
                  <span>
                    <Braces />
                    <b>{view.label}</b>
                  </span>
                  {!view.empty && (
                    <button
                      aria-label="Copier le contenu affiché"
                      onClick={() => void copy(text)}
                    >
                      <Copy />
                      Copier
                    </button>
                  )}
                </div>
                {view.headers ? (
                  <div className={s.headers}>
                    {Object.entries(view.headers).map(([source, values]) => (
                      <section key={source}>
                        <h3>{source}</h3>
                        {Object.keys(values).length ? (
                          <dl>
                            {Object.entries(values).map(([name, value]) => (
                              <Fragment key={name}>
                                <dt>{name}</dt>
                                <dd>{value}</dd>
                              </Fragment>
                            ))}
                          </dl>
                        ) : (
                          <p>Aucun en-tête conservé.</p>
                        )}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className={s.code}>
                    {text.split("\n").map((line, i) => (
                      <div key={i} className={s.line}>
                        <i aria-hidden="true">{i + 1}</i>
                        <code>{view.json ? jsonLine(line) : line}</code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
}
