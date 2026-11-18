"use client";
import { useEffect, useRef, useState } from "react";
import { Block, Variables, Field } from "./editor-fields";
import {
  ArrowLeft,
  Braces,
  Check,
  Clipboard,
  Code2,
  GitBranch,
  Play,
  Radio,
  Save,
  Send,
  Webhook,
} from "lucide-react";
import { blank, compile, FieldError, methods } from "./model";
import type { Draft } from "./model";
import { navigate, api, pretty, RequestError, urlFor, utc } from "./client";
import type { Item, Version, Workspace } from "./client";
const presets: Record<number, unknown> = {
  200: { ok: true },
  400: { code: "INVALID_REQUEST", message: "Paramètre invalide" },
  401: { code: "UNAUTHORIZED" },
  404: { code: "NOT_FOUND" },
  429: { code: "RATE_LIMITED" },
  500: { code: "INTERNAL_ERROR" },
};
export function Editor({
  item,
  ws,
  project,
  refresh,
  notify,
}: {
  item?: Item;
  ws: Workspace;
  project: string;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [d, set] = useState<Draft>(
    () => item?.draft || blank(project || ws.user.projects[0] || ""),
  );
  const [revision, setRevision] = useState(item?.revision),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState({ field: "", message: "" }),
    [versions, setVersions] = useState<Version[]>([]),
    [raw, setRaw] = useState("");
  const [active, setActive] = useState(item?.active || 0),
    [minutes, setMinutes] = useState(false),
    [targetBody, setTargetBody] = useState<"body" | "hookBody">("body");
  const bodyRef = useRef<HTMLTextAreaElement>(null),
    hookRef = useRef<HTMLTextAreaElement>(null);
  const archived = !!item?.archived;
  useEffect(() => {
    if (item)
      api<Version[]>("versions/" + item.id)
        .then(setVersions)
        .catch((e) => notify(e.message));
  }, [item?.id, active, notify]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const block = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", block);
    return () => window.removeEventListener("beforeunload", block);
  }, [dirty]);
  function edit<K extends keyof Draft>(k: K, v: Draft[K]) {
    set((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
    setIssue({ field: "", message: "" });
  }
  let preview: ReturnType<typeof compile> | undefined,
    validation: FieldError | undefined;
  try {
    preview = compile(d);
  } catch (e) {
    validation = e as FieldError;
  }
  const err = (k: string) =>
    issue.field === k
      ? issue.message
      : validation?.field === k && k !== "name"
        ? validation.message
        : undefined;
  function insert(name: string) {
    const ref = targetBody === "body" ? bodyRef : hookRef,
      input = ref.current;
    if (!input) return;
    const s = input.selectionStart,
      e = input.selectionEnd,
      token = "{{" + name + "}}";
    const value = d[targetBody];
    const inString =
      (value.slice(0, s).match(/(?<!\\)"/g) || []).length % 2 === 1;
    const text =
      inString || (targetBody === "body" && d.contentType === "text/plain")
        ? token
        : JSON.stringify(token);
    edit(targetBody, value.slice(0, s) + text + value.slice(e));
    input.focus();
    requestAnimationFrame(() =>
      input.setSelectionRange(s + text.length, s + text.length),
    );
  }
  function format(k: "body" | "hookBody") {
    try {
      edit(k, pretty(JSON.parse(d[k])));
    } catch (e) {
      setIssue({ field: k, message: (e as Error).message });
    }
  }
  async function persist(publish: boolean) {
    setBusy(true);
    try {
      if (publish && validation) throw validation;
      const s = await api<Item>(
        item
          ? "scenarios/" + item.id + "/" + (publish ? "publish" : "save")
          : "scenarios",
        { draft: d, revision, publish },
      );
      setDirty(false);
      setRevision(s.revision);
      setActive(s.active);
      await refresh();
      notify(
        publish
          ? "Version v" + s.active + " publiée."
          : "Brouillon enregistré.",
      );
      if (!item) navigate("#/editor/" + s.id);
    } catch (e) {
      setIssue({
        field: (e as RequestError).field || "save",
        message: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!item) return;
    setBusy(true);
    try {
      const r = await api<{ id: string }>("scenarios/" + item.id + "/run", {
        raw,
      });
      navigate("#/runs/" + r.id);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const activeD = versions[0]?.config;
  const curl =
    item && activeD
      ? `curl -X ${activeD.method} '${urlFor(item.id, activeD.path)}' -H "X-Lab-Key: ${"$RELAIS_TEST_KEY"}"`
      : "";
  const area = (k: "body" | "hookBody", label: string) => (
    <>
      <Field label={label} error={err(k)}>
        <textarea
          ref={k === "body" ? bodyRef : hookRef}
          className="codeInput"
          rows={6}
          value={d[k]}
          onFocus={() => setTargetBody(k)}
          onChange={(e) => edit(k, e.target.value)}
        />
      </Field>
      <div className="inline">
        <button className="textBtn" type="button" onClick={() => format(k)}>
          Indenter le JSON
        </button>
        {d.variables.length > 0 && (
          <select
            aria-label={"Insérer une variable dans " + label}
            value=""
            onChange={(e) => {
              const input = (k === "body" ? bodyRef : hookRef).current;
              if (!input) return;
              const token = "{{" + e.target.value + "}}",
                v = d[k],
                at = input.selectionStart;
              const inside =
                (v.slice(0, at).match(/(?<!\\)"/g) || []).length % 2 === 1;
              edit(
                k,
                v.slice(0, at) +
                  (inside || (k === "body" && d.contentType === "text/plain")
                    ? token
                    : JSON.stringify(token)) +
                  v.slice(input.selectionEnd),
              );
              input.focus();
            }}
          >
            <option value="">Insérer une variable…</option>
            {d.variables.map((v, i) => (
              <option key={i}>{v.name}</option>
            ))}
          </select>
        )}
      </div>
    </>
  );
  return (
    <>
      <a className="back" href="#/library">
        <ArrowLeft size={15} />
        Bibliothèque
      </a>
      <header className="pageheading">
        <div>
          <div className="eyeline">ÉDITEUR HTTP</div>
          <h1>{item ? d.name || "Sans titre" : "Nouvelle simulation"}</h1>
          <p role="status">
            {archived
              ? "Simulation archivée"
              : dirty
                ? "Modifications non enregistrées"
                : item
                  ? "Brouillon enregistré"
                  : "Brouillon local"}
            {active ? " · Version active v" + active : ""}
          </p>
        </div>
      </header>
      <div className="editorLayout">
        <fieldset disabled={archived || busy} className="editorForm">
          <Block icon={GitBranch} title="Déclencheur">
            <div className="formgrid">
              <Field label="Nom de la simulation" error={err("name")}>
                <input
                  value={d.name}
                  onChange={(e) => edit("name", e.target.value)}
                />
              </Field>
              <Field label="Projet">
                <select
                  disabled={!!item}
                  value={d.project}
                  onChange={(e) => edit("project", e.target.value)}
                >
                  {ws.user.projects.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Service simulé">
                <input
                  value={d.service}
                  onChange={(e) => edit("service", e.target.value)}
                />
              </Field>
              <Field label="Tags (séparés par des virgules)">
                <input
                  value={d.tags.join(",")}
                  onChange={(e) =>
                    edit("tags", e.target.value.split(",").slice(0, 20))
                  }
                />
              </Field>
            </div>
            <Field label="Description">
              <input
                value={d.description}
                onChange={(e) => edit("description", e.target.value)}
              />
            </Field>
            <div className="formgrid routeFields">
              <Field label="Méthode">
                <select
                  value={d.method}
                  onChange={(e) =>
                    edit("method", e.target.value as Draft["method"])
                  }
                >
                  {methods.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Chemin exact" error={err("path")}>
                <input
                  value={d.path}
                  onChange={(e) => edit("path", e.target.value)}
                />
              </Field>
            </div>
          </Block>
          <Block icon={Braces} title="Réponse immédiate">
            <div className="presets">
              {Object.keys(presets).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    set({
                      ...d,
                      status: +n,
                      noBody: false,
                      body: pretty(presets[+n]),
                      contentType: "application/json",
                    });
                    setDirty(true);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="formgrid">
              <Field label="Statut HTTP" error={err("status")}>
                <input
                  type="number"
                  value={d.status}
                  onChange={(e) => edit("status", Number(e.target.value))}
                />
              </Field>
              <Field label="Type de contenu">
                <select
                  value={d.contentType}
                  onChange={(e) =>
                    edit("contentType", e.target.value as Draft["contentType"])
                  }
                >
                  {[
                    "application/json",
                    "application/problem+json",
                    "text/plain",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={d.noBody}
                onChange={(e) => edit("noBody", e.target.checked)}
              />
              Sans corps
            </label>
            {err("noBody") && <p className="error">{err("noBody")}</p>}
            {!d.noBody && area("body", "Corps de la réponse")}
            <details open={err("headers") ? true : undefined}>
              <summary>En-têtes de réponse</summary>
              <Field label="En-têtes JSON" error={err("headers")}>
                <textarea
                  value={d.headers}
                  onChange={(e) => edit("headers", e.target.value)}
                />
              </Field>
            </details>
            <Variables
              list={d.variables}
              update={(list) => edit("variables", list)}
              insert={insert}
            />
            {err("variables") && <p className="error">{err("variables")}</p>}
          </Block>
          <Block icon={Webhook} title="Webhook différé">
            <label className="check">
              <input
                type="checkbox"
                checked={d.webhook}
                onChange={(e) => edit("webhook", e.target.checked)}
              />
              Programmer une notification POST
            </label>
            {d.webhook && (
              <>
                <Field label="Destination autorisée" error={err("destination")}>
                  <select
                    value={d.destination}
                    onChange={(e) => edit("destination", e.target.value)}
                  >
                    <option value="">Sélectionner une destination</option>
                    {ws.destinations
                      .filter((x) => x.projects.includes(d.project))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="formgrid">
                  <Field label="Délai" error={err("delay")}>
                    <input
                      type="number"
                      min="0"
                      value={d.delay / (minutes ? 60 : 1)}
                      onChange={(e) =>
                        edit(
                          "delay",
                          Number(e.target.value) * (minutes ? 60 : 1),
                        )
                      }
                    />
                  </Field>
                  <Field label="Unité">
                    <select
                      value={minutes ? "min" : "s"}
                      onChange={(e) => setMinutes(e.target.value === "min")}
                    >
                      <option value="s">Secondes</option>
                      <option value="min">Minutes</option>
                    </select>
                  </Field>
                </div>
                {area("hookBody", "Corps du webhook")}
                <details open={err("hookHeaders") ? true : undefined}>
                  <summary>En-têtes du webhook</summary>
                  <Field label="En-têtes POST" error={err("hookHeaders")}>
                    <textarea
                      value={d.hookHeaders}
                      onChange={(e) => edit("hookHeaders", e.target.value)}
                    />
                  </Field>
                </details>
              </>
            )}
          </Block>
          <details className="panel block">
            <summary>Preuves de recette</summary>
            <Field label="Résultat attendu dans l’application testée">
              <textarea
                value={d.expected}
                onChange={(e) => edit("expected", e.target.value)}
              />
            </Field>
            <Field label="SHA du code testé" error={err("sha")}>
              <input
                value={d.sha}
                onChange={(e) => edit("sha", e.target.value)}
              />
            </Field>
          </details>
          {issue.message && (
            <p className="error" role="alert">
              {issue.message}
            </p>
          )}
          <div className="actions">
            <button className="btn" onClick={() => persist(false)}>
              <Save />
              Enregistrer le brouillon
            </button>
            <button className="btn primary" onClick={() => persist(true)}>
              <Send />
              Publier une version
            </button>
          </div>
        </fieldset>
        <aside className="previewCol">
          <section className="codePanel">
            <div>
              <Code2 size={17} />
              Aperçu de la réponse
            </div>
            <small>EXEMPLE GÉNÉRÉ LOCALEMENT</small>
            {preview ? (
              <>
                <b>HTTP {d.status}</b>
                <pre>
                  {d.noBody
                    ? "(sans corps)"
                    : d.contentType +
                      "\n" +
                      Object.entries(preview.headers)
                        .map(([k, v]) => k + ": " + v)
                        .join("\n")}
                </pre>
                <pre>
                  {preview.body === null
                    ? ""
                    : d.contentType === "text/plain"
                      ? preview.body
                      : pretty(JSON.parse(preview.body))}
                </pre>
              </>
            ) : (
              <p>{validation?.message}</p>
            )}
          </section>
          {item && !!active && !archived && (
            <section className="panel block">
              <h2>
                <Radio />
                Point d’appel actif
              </h2>
              {activeD && (
                <>
                  <code className="wrap">{urlFor(item.id, activeD.path)}</code>
                  <button
                    className="btn small"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(curl)
                        .then(() => notify("Commande cURL copiée."))
                        .catch(() => notify("Copie indisponible."))
                    }
                  >
                    <Clipboard />
                    Copier le cURL
                  </button>
                </>
              )}
              <details>
                <summary>Corps JSON de l’appel test</summary>
                <textarea
                  aria-label="Requête JSON de test"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
              </details>
              <button className="btn" disabled={busy} onClick={run}>
                <Play />
                Exécuter la version v{active}
              </button>
            </section>
          )}
          {versions.length > 0 && (
            <section className="panel block">
              <h2>
                <Check />
                Publications
              </h2>
              {versions.map((v) => (
                <details key={v.number}>
                  <summary>
                    v{v.number} · {utc(v.published)}
                  </summary>
                  <pre>{pretty(v.config)}</pre>
                </details>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
