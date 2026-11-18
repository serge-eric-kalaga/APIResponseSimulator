"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { insertVariable, indentJson } from "./insert-variable";
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
  initialEnvironment,
  refresh,
  notify,
}: {
  item?: Item;
  ws: Workspace;
  project: string;
  initialEnvironment?: string;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [d, set] = useState<Draft>(() =>
    item
      ? { ...item.draft, environment: item.environment }
      : {
          ...blank(
            ws.environments.find((e) => e.id === initialEnvironment)?.project ||
              project ||
              ws.user.projects[0] ||
              "",
          ),
          environment: initialEnvironment,
        },
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
  const readOnly = !!item && !item.writable;
  const archived = !!item?.archived || readOnly;
  useEffect(() => {
    if (item && item.writable)
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
  const { preview, validation } = useMemo(() => {
    try {
      return { preview: compile(d) };
    } catch (error) {
      return { validation: error as FieldError };
    }
  }, [d]);
  const err = (k: string) =>
    issue.field === k
      ? issue.message
      : validation?.field === k && k !== "name"
        ? validation.message
        : undefined;
  function insert(name: string, destination = targetBody) {
    const ref = destination === "body" ? bodyRef : hookRef,
      input = ref.current;
    if (!input) return;
    const kind =
      destination === "hookBody"
        ? "json"
        : d.contentType.endsWith("/xml")
          ? "xml"
          : d.contentType === "text/plain"
            ? "text"
            : "json";
    try {
      const { body, cursor } = insertVariable(
        d[destination],
        name,
        input.selectionStart,
        input.selectionEnd,
        kind,
      );
      edit(destination, body);
      input.focus();
      requestAnimationFrame(() => input.setSelectionRange(cursor, cursor));
    } catch (e) {
      setIssue({ field: destination, message: (e as Error).message });
    }
  }
  function format(k: "body" | "hookBody") {
    try {
      edit(k, indentJson(d[k]));
    } catch (e) {
      setIssue({ field: k, message: (e as Error).message });
    }
  }
  const envId =
    d.environment ||
    ws.environments.find((e) => e.project === d.project && e.primary_env)?.id;
  const receivers = ws.destinations.filter(
    (x) =>
      x.projects.includes(d.project) &&
      (!x.environmentId || x.environmentId === envId),
  );
  const selectedReceiver = receivers.find((x) => x.id === d.destination);
  async function registerUrl() {
    if (selectedReceiver) return selectedReceiver;
    const r = await api<{ id: string; status: string }>("receivers", {
      url: d.destination,
      project: d.project,
      environment: envId,
    });
    await refresh();
    edit("destination", r.id);
    return r;
  }
  async function persist(publish: boolean) {
    setBusy(true);
    try {
      if (publish && validation) throw validation;
      let draft = d;
      if (publish && d.webhook) {
        const r = await registerUrl();
        if (r.status !== "active")
          throw new FieldError(
            "destination",
            r.status === "pending"
              ? "Cette URL attend l’autorisation du pilote. Vous pouvez enregistrer le brouillon."
              : "L’autorisation de cette URL a été retirée.",
          );
        draft = { ...d, destination: r.id };
      }
      const s = await api<Item>(
        item
          ? "scenarios/" + item.id + "/" + (publish ? "publish" : "save")
          : "scenarios",
        { draft, revision, publish },
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
        {(k === "hookBody" || d.contentType.includes("json")) && (
          <button className="textBtn" type="button" onClick={() => format(k)}>
            Indenter le JSON
          </button>
        )}
        {d.variables.length > 0 && (
          <select
            aria-label={"Insérer une variable dans " + label}
            value=""
            onChange={(e) => insert(e.target.value, k)}
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
            {readOnly
              ? "Partagée en lecture"
              : archived
                ? "Simulation archivée"
                : dirty
                  ? "Modifications non enregistrées"
                  : item
                    ? "Brouillon enregistré"
                    : "Brouillon local"}
            {active ? " · Version active v" + active : ""}
          </p>
        </div>
        {!!item?.writable && (
          <a className="btn" href={"#/sharing/simulation/" + item.id}>
            Partager la simulation
          </a>
        )}
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
                  onChange={(e) => {
                    set({
                      ...d,
                      project: e.target.value,
                      environment: undefined,
                      destination: "",
                    });
                    setDirty(true);
                  }}
                >
                  {(readOnly ? [d.project] : ws.user.projects).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Environnement">
                <select
                  disabled={!!item}
                  value={
                    d.environment ||
                    ws.environments.find(
                      (e) => e.project === d.project && e.primary_env,
                    )?.id ||
                    ""
                  }
                  onChange={(e) => {
                    set({ ...d, environment: e.target.value, destination: "" });
                    setDirty(true);
                  }}
                >
                  {readOnly ? (
                    <option value={item.environment}>
                      {item.environmentName}
                    </option>
                  ) : (
                    ws.environments
                      .filter((e) => e.project === d.project && e.writable)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))
                  )}
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
                  onChange={(e) => {
                    const contentType = e.target.value as Draft["contentType"];
                    const initial =
                      d.body === blank(d.project).body || !d.body.trim();
                    set({
                      ...d,
                      contentType,
                      body:
                        initial && contentType.endsWith("/xml")
                          ? "<reponse>OK</reponse>"
                          : d.body,
                    });
                    setDirty(true);
                  }}
                >
                  {[
                    "application/json",
                    "application/problem+json",
                    "text/plain",
                    "application/xml",
                    "text/xml",
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
                <Field label="URL de réception" error={err("destination")}>
                  <input
                    type="url"
                    placeholder="https://recette.exemple.fr/webhooks"
                    value={selectedReceiver?.url || d.destination}
                    onChange={(e) =>
                      edit(
                        "destination",
                        receivers.find((r) => r.url === e.target.value)?.id ||
                          e.target.value,
                      )
                    }
                  />
                </Field>
                {selectedReceiver ? (
                  <p className="receiverState">
                    {selectedReceiver.status === "active"
                      ? "URL autorisée"
                      : selectedReceiver.status === "pending"
                        ? "Autorisation en attente"
                        : "Autorisation retirée"}
                  </p>
                ) : (
                  <button
                    className="btn small"
                    disabled={!d.destination || busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const r = await registerUrl();
                        notify(
                          r.status === "active"
                            ? "URL autorisée."
                            : "URL enregistrée. Validation disponible dans Notifications pour l’administrateur.",
                        );
                      } catch (e) {
                        setIssue({
                          field: "destination",
                          message: (e as Error).message,
                        });
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Enregistrer l’URL
                  </button>
                )}
                <Field label="Destination autorisée">
                  <select
                    value={
                      selectedReceiver?.status === "active"
                        ? selectedReceiver.id
                        : ""
                    }
                    onChange={(e) => edit("destination", e.target.value)}
                  >
                    <option value="">Sélectionner une destination</option>
                    {receivers
                      .filter((x) => x.status === "active")
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
                  {[
                    ...(d.noBody ? [] : ["Content-Type: " + d.contentType]),
                    ...Object.entries(preview.headers).map(
                      ([k, v]) => k + ": " + v,
                    ),
                  ].join("\n")}
                </pre>
                <pre>
                  {preview.body === null
                    ? "(sans corps)"
                    : !d.contentType.includes("json")
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
