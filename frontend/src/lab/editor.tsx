"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { insertVariable, indentJson } from "./insert-variable";
import { appendVariable, Variables, Field } from "./editor-fields";
import {
  Braces,
  ChevronRight,
  Eye,
  Settings2,
  Upload,
  Variable,
  Webhook,
} from "lucide-react";
import { EditorTabs, EditorPanel, EditorDialog } from "./editor-controls";
import { EditorSettings } from "./editor-settings";
import { EditorPayload, type Part } from "./editor-payload";
import { EditorPreview, previewText } from "./editor-preview";
import s from "./editor.module.css";
import { blank, compile, FieldError } from "./model";
import type { Draft } from "./model";
import { navigate, api, pretty, RequestError, utc } from "./client";
import type { Item, Version, Workspace } from "./client";
const sections = [
  { id: "response", label: "Réponse", icon: <Braces size={16} /> },
  { id: "variables", label: "Variables", icon: <Variable size={16} /> },
  { id: "hook", label: "Webhook", icon: <Webhook size={16} /> },
  { id: "settings", label: "Paramètres", icon: <Settings2 size={16} /> },
] as const;
type Section = (typeof sections)[number]["id"];

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
  const [d, set] = useState<Draft>(() =>
    item ? item.draft : blank(project || ws.user.projects[0] || ""),
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
  const [section, setSection] = useState<Section>(
    item ? "response" : "settings",
  );
  const [responsePart, setResponsePart] = useState<Part>("body");
  const [hookPart, setHookPart] = useState<Part>("body");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [dialog, setDialog] = useState<"publish" | "history" | null>(null);
  const readOnly = !!item && !item.writable;
  const archived = !!item?.archived || readOnly;
  useEffect(() => {
    let current = true;
    if (item?.writable)
      api<Version[]>("versions/" + item.id)
        .then((list) => {
          if (current) setVersions(list);
        })
        .catch((e) => {
          if (current) notify(e.message);
        });
    return () => {
      current = false;
    };
  }, [item?.id, item?.writable, active, notify]);
  useEffect(() => {
    const wide = matchMedia("(min-width: 701px)");
    const resize = () => {
      if (wide.matches) setMobilePreview(false);
    };
    wide.addEventListener("change", resize);
    return () => wide.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const block = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", block);
    return () => window.removeEventListener("beforeunload", block);
  }, [dirty]);
  function patch(changes: Partial<Draft>) {
    set((prev) => ({ ...prev, ...changes }));
    setDirty(true);
    setIssue({ field: "", message: "" });
  }
  function edit<K extends keyof Draft>(key: K, value: Draft[K]) {
    patch({ [key]: value });
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
    setSection(destination === "body" ? "response" : "hook");
    (destination === "body" ? setResponsePart : setHookPart)("body");
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
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(cursor, cursor);
      });
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
  const receivers = ws.destinations.filter((x) =>
    x.projects.includes(d.project),
  );
  const selectedReceiver = receivers.find((x) => x.id === d.destination);
  async function registerUrl() {
    if (selectedReceiver?.status === "active") return selectedReceiver;
    const r = await api<{ id: string; status: string }>("receivers", {
      url: selectedReceiver?.url ?? d.destination,
      id: selectedReceiver?.id,
      project: d.project,
    });
    await refresh();
    edit("destination", r.id);
    return r;
  }
  function showIssue(field: string, message: string) {
    const target = ["sha", "path", "name", "project"].includes(field)
      ? "settings"
      : field === "variables"
        ? "variables"
        : ["destination", "delay", "hookBody", "hookHeaders"].includes(field)
          ? "hook"
          : field === "save"
            ? section
            : "response";
    setSection(target);
    if (field === "headers" || field === "body") setResponsePart(field);
    if (field === "hookHeaders" || field === "hookBody")
      setHookPart(field === "hookHeaders" ? "headers" : "body");
    setIssue({ field, message });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          "#panel-" + target + ' [aria-invalid="true"]',
        )
        ?.focus(),
    );
  }
  async function persist(publish: boolean) {
    setBusy(true);
    try {
      if (publish && validation) throw validation;
      let draft = d;
      if (publish && d.webhook) {
        try {
          const r = await registerUrl();
          draft = { ...d, destination: r.id };
        } catch (e) {
          throw new FieldError("destination", (e as Error).message);
        }
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
      showIssue((e as RequestError).field || "save", (e as Error).message);
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
  const locked = archived || busy;
  const state = readOnly
    ? "Partagée en lecture"
    : archived
      ? "Simulation archivée"
      : dirty
        ? "Modifications non enregistrées"
        : item
          ? "Brouillon enregistré"
          : "Brouillon local";
  const payloadProps = {
    draft: d,
    disabled: locked,
    edit,
    insert,
    indent: format,
    err,
    onBodyFocus: setTargetBody,
    create: (k: "body" | "hookBody") => {
      setTargetBody(k);
      edit("variables", appendVariable(d.variables));
      setSection("variables");
    },
  };
  const rail = (
    <EditorPreview
      draft={d}
      preview={preview}
      error={validation?.message}
      item={item}
      version={versions.find((v) => v.number === active)}
      active={active}
      raw={raw}
      setRaw={setRaw}
      busy={busy}
      run={run}
      history={() => setDialog("history")}
      notify={notify}
      sheet={mobilePreview}
    />
  );
  return (
    <div className={s.workbench}>
      <div className={s.crumb}>
        <a href="#/library">Bibliothèque</a>
        <ChevronRight size={13} /> Éditeur de simulation
      </div>
      <header className={s.hero}>
        <div>
          <h1>
            {d.name.trim() || (item ? "Sans titre" : "Nouvelle simulation")}
          </h1>
          <div className={s.route}>
            <b>{d.method}</b>
            <code>{d.path}</code>
            {!!active && <span>·　v{active} active</span>}
          </div>
        </div>
        <div className={s.buttons}>
          <button
            className={"btn " + s.mobileEye}
            onClick={() => setMobilePreview(true)}
          >
            <Eye />
            Aperçu
          </button>
          {!archived && (
            <>
              <button
                className="btn"
                disabled={busy}
                aria-label="Enregistrer le brouillon"
                onClick={() => persist(false)}
              >
                Enregistrer
              </button>
              <button
                className={"btn " + s.primary}
                disabled={busy}
                aria-label="Publier une version"
                onClick={() =>
                  validation
                    ? showIssue(validation.field, validation.message)
                    : setDialog("publish")
                }
              >
                <Upload />
                Publier
              </button>
            </>
          )}
        </div>
      </header>
      <EditorTabs
        tabs={sections}
        label="Configuration de la simulation"
        value={section}
        select={setSection}
      />
      <div className={s.grid}>
        <div>
          <div className={s.sectionHead}>
            <h2>
              {
                {
                  response: "Réponse immédiate",
                  settings: "Paramètres de la simulation",
                  variables: "Variables typées",
                  hook: "Webhook différé",
                }[section]
              }
            </h2>
            <span role="status" className={dirty ? s.dirty : s.muted}>
              {state}
            </span>
          </div>
          <EditorPanel id="response" selected={section}>
            <fieldset disabled={locked}>
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
                      const contentType = e.target
                        .value as Draft["contentType"];
                      const initial =
                        d.body === blank(d.project).body || !d.body.trim();
                      patch({
                        contentType,
                        body:
                          initial && contentType.endsWith("/xml")
                            ? "<reponse>OK</reponse>"
                            : d.body,
                      });
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
            </fieldset>
            <EditorPayload
              {...payloadProps}
              target="body"
              part={responsePart}
              selectPart={setResponsePart}
              bodyRef={bodyRef}
            />
            <fieldset disabled={locked}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={d.noBody}
                  aria-invalid={!!err("noBody")}
                  aria-describedby={err("noBody") ? "no-body-error" : undefined}
                  onChange={(e) => edit("noBody", e.target.checked)}
                />
                Sans corps de réponse
              </label>
              {err("noBody") && (
                <p id="no-body-error" role="alert" className="error">
                  {err("noBody")}
                </p>
              )}

              <details className={s.more}>
                <summary>Modèles de réponse</summary>
                <div className="presets">
                  {Object.keys(presets).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        patch({
                          status: +n,
                          noBody: false,
                          body: pretty(presets[+n]),
                          contentType: "application/json",
                        });
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </details>
            </fieldset>
          </EditorPanel>
          <EditorPanel id="variables" selected={section}>
            <fieldset disabled={locked}>
              <Variables
                list={d.variables}
                update={(list) => edit("variables", list)}
                insert={(name) => {
                  const target =
                    targetBody === "hookBody" && d.webhook
                      ? "hookBody"
                      : "body";
                  if (target === "body" && d.noBody) {
                    showIssue(
                      "noBody",
                      "Activez le corps de réponse pour insérer la variable.",
                    );
                    return;
                  }
                  insert(name, target);
                }}
              />
              {err("variables") && (
                <p className="error" role="alert">
                  {err("variables")}
                </p>
              )}
            </fieldset>
          </EditorPanel>
          <EditorPanel id="hook" selected={section}>
            <fieldset disabled={locked}>
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
                  {selectedReceiver?.status === "active" ? (
                    <p className="receiverState">URL enregistrée</p>
                  ) : (
                    <button
                      className="btn small"
                      disabled={!d.destination || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await registerUrl();
                          notify("URL enregistrée.");
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
                  <Field label="Destination enregistrée">
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
                </>
              )}
            </fieldset>
            {d.webhook && (
              <EditorPayload
                {...payloadProps}
                target="hookBody"
                part={hookPart}
                selectPart={setHookPart}
                bodyRef={hookRef}
              />
            )}
          </EditorPanel>
          <EditorPanel id="settings" selected={section}>
            <EditorSettings
              draft={d}
              locked={locked}
              existing={!!item}
              projects={readOnly ? [d.project] : ws.user.projects}
              edit={edit}
              err={err}
              changeProject={(project) => patch({ project, destination: "" })}
            />
            {!!item?.writable && (
              <a className="btn" href={"#/sharing/simulation/" + item.id}>
                Partager la simulation
              </a>
            )}
          </EditorPanel>
          {issue.message &&
            ![
              "body",
              "headers",
              "hookHeaders",
              "hookBody",
              "variables",
              "sha",
              "path",
              "name",
              "delay",
              "destination",
              "status",
              "noBody",
            ].includes(issue.field) && (
              <p className="error" role="alert">
                {issue.message}
              </p>
            )}
        </div>
        <aside className={s.rail}>{!mobilePreview && rail}</aside>
      </div>
      {mobilePreview && (
        <EditorDialog
          title="Aperçu du brouillon"
          sheet
          close={() => setMobilePreview(false)}
        >
          {rail}
        </EditorDialog>
      )}
      {dialog === "publish" && preview && (
        <EditorDialog
          title={"Publier la version v" + (active + 1)}
          close={() => setDialog(null)}
        >
          <p className={s.route}>
            <b>{d.method}</b>
            <code>{d.path}</code> → HTTP {d.status}
          </p>
          <pre className={s.sample}>{previewText(d, preview.body)}</pre>
          <button
            className={"btn " + s.primary}
            disabled={busy}
            onClick={() => {
              setDialog(null);
              void persist(true);
            }}
          >
            Confirmer la publication
          </button>
        </EditorDialog>
      )}
      {dialog === "history" && (
        <EditorDialog
          title="Historique des publications"
          close={() => setDialog(null)}
        >
          {versions.map((v) => (
            <details className={s.more} key={v.number}>
              <summary>
                v{v.number} · {utc(v.published)}
              </summary>
              <pre className={s.sample}>{pretty(v.config)}</pre>
            </details>
          ))}
        </EditorDialog>
      )}
    </div>
  );
}
