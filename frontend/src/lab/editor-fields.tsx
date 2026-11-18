import { cloneElement, useId } from "react";
import type { ReactNode, ReactElement, HTMLAttributes } from "react";
import { Braces, Plus, Trash2 } from "lucide-react";
import { jsonTypes, newVariable } from "./model";
import type { Variable } from "./model";

/** Keep the label stable when inline validation adds explanatory text. */
export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactElement<HTMLAttributes<HTMLElement>>;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        "aria-invalid": !!error,
        "aria-describedby": error ? id + "-error" : undefined,
      })}
      {error && (
        <small role="alert" id={id + "-error"}>
          {error}
        </small>
      )}
    </div>
  );
}
export function Block({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Braces;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="panel block">
      <h2>
        <Icon size={18} />
        {title}
      </h2>
      {children}
    </section>
  );
}
export function Variables({
  list,
  update,
  insert,
}: {
  list: Variable[];
  update: (list: Variable[]) => void;
  insert: (name: string) => void;
}) {
  function change(i: number, patch: Partial<Variable>) {
    update(list.map((v, n) => (n === i ? { ...v, ...patch } : v)));
  }
  return (
    <>
      <div className="sectionTitle">
        <h3>Variables typées</h3>
        <button
          type="button"
          className="btn small"
          onClick={() =>
            update([
              ...list,
              {
                ...newVariable(),
                name: list.length
                  ? "variable" + (list.length + 1)
                  : "reference",
              },
            ])
          }
        >
          <Plus />
          Ajouter
        </button>
      </div>
      {list.map((v, i) => (
        <div className="variable" key={i}>
          <div className="formgrid">
            <Field label="Nom de variable">
              <input
                value={v.name}
                onChange={(e) => change(i, { name: e.target.value })}
              />
            </Field>
            <Field label="Type JSON">
              <select
                value={v.type}
                onChange={(e) =>
                  change(i, { type: e.target.value as Variable["type"] })
                }
              >
                {jsonTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Mode">
              <select
                value={v.mode}
                onChange={(e) =>
                  change(i, { mode: e.target.value as Variable["mode"] })
                }
              >
                <option value="fixed">Fixe</option>
                <option value="generate">Généré</option>
                <option value="input">Champ entrant facultatif</option>
              </select>
            </Field>
            {v.mode === "input" && (
              <Field label="Nom du champ entrant">
                <input
                  value={v.source}
                  onChange={(e) => change(i, { source: e.target.value })}
                />
              </Field>
            )}
            {v.mode !== "generate" && (
              <Field
                label={v.mode === "input" ? "Valeur par défaut" : "Valeur fixe"}
              >
                <input
                  value={v.value}
                  onChange={(e) => change(i, { value: e.target.value })}
                />
              </Field>
            )}
            {v.mode === "generate" &&
              v.type === "integer" &&
              (["min", "max"] as const).map((k) => (
                <Field label={k === "min" ? "Minimum" : "Maximum"} key={k}>
                  <input
                    type="number"
                    value={v[k]}
                    onChange={(e) => change(i, { [k]: Number(e.target.value) })}
                  />
                </Field>
              ))}
            {v.mode === "generate" && v.type === "string" && (
              <>
                <Field label="Longueur">
                  <input
                    type="number"
                    value={v.length}
                    onChange={(e) =>
                      change(i, { length: Number(e.target.value) })
                    }
                  />
                </Field>
                {(["alphabet", "prefix"] as const).map((k) => (
                  <Field
                    label={k === "prefix" ? "Préfixe" : "Alphabet"}
                    key={k}
                  >
                    <input
                      value={v[k]}
                      onChange={(e) => change(i, { [k]: e.target.value })}
                    />
                  </Field>
                ))}
              </>
            )}
          </div>
          <div className="inline">
            <button
              type="button"
              className="textBtn"
              onClick={() => insert(v.name)}
            >
              Insérer dans le corps
            </button>
            <button
              type="button"
              className="iconBtn"
              aria-label={"Supprimer " + v.name}
              onClick={() => update(list.filter((_, n) => n !== i))}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
