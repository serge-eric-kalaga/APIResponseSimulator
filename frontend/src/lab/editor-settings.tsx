import type { Draft } from "./model";
import { methods } from "./model";
import { Field } from "./editor-fields";
import s from "./editor.module.css";

export function EditorSettings({
  draft: d,
  locked,
  existing,
  projects,
  edit,
  err,
  changeProject,
}: {
  draft: Draft;
  locked: boolean;
  existing: boolean;
  projects: string[];
  edit: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  err: (field: string) => string | undefined;
  changeProject: (name: string) => void;
}) {
  return (
    <fieldset disabled={locked}>
      <div className="formgrid">
        <Field label="Nom de la simulation" error={err("name")}>
          <input
            value={d.name}
            onChange={(e) => edit("name", e.target.value)}
          />
        </Field>
        <Field label="Projet">
          <select
            disabled={existing}
            value={d.project}
            onChange={(e) => changeProject(e.target.value)}
          >
            {projects.map((p) => (
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
            onChange={(e) => edit("method", e.target.value as Draft["method"])}
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

      <h3 className={s.subhead}>Preuves de recette</h3>
      <Field label="Résultat attendu dans l’application testée">
        <textarea
          value={d.expected}
          onChange={(e) => edit("expected", e.target.value)}
        />
      </Field>
      <Field label="SHA du code testé" error={err("sha")}>
        <input value={d.sha} onChange={(e) => edit("sha", e.target.value)} />
      </Field>
    </fieldset>
  );
}
