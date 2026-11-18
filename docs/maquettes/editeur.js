// Interactive review fixture. Edits, publications and test calls stay in this page.
const byId = (id) => document.getElementById(id);
const variables = [];
const versions = [];
const mobile = matchMedia("(max-width:700px)");
const preview = byId("preview-content");
const notice = byId("notice");
function message(text) {
  notice.textContent = text;
  clearTimeout(message.timer);
  message.timer = setTimeout(() => (notice.textContent = ""), 2300);
}
function selectTab(tab, focus = false) {
  const peers = [...tab.parentElement.querySelectorAll('[role="tab"]')];
  for (const peer of peers) {
    const active = peer === tab;
    peer.setAttribute("aria-selected", String(active));
    peer.tabIndex = active ? 0 : -1;
    byId(peer.getAttribute("aria-controls")).hidden = !active;
  }
  if (focus) tab.focus();
}
for (const list of document.querySelectorAll('[role="tablist"]')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  selectTab(tabs[0]);
  tabs.forEach((tab, i) => {
    tab.onclick = () => selectTab(tab);
    tab.onkeydown = (event) => {
      const next = {
        ArrowLeft: (i + tabs.length - 1) % tabs.length,
        ArrowRight: (i + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (next !== undefined) {
        event.preventDefault();
        selectTab(tabs[next], true);
      }
    };
  });
}
function change() {
  byId("saved").textContent = "Modifications en cours";
  byId("saved").classList.add("dirty");
  render();
}
function clean() {
  byId("saved").textContent = "Brouillon enregistré";
  byId("saved").classList.remove("dirty");
  render();
}
function variableValue(v) {
  if (v.type === "string") return v.value;
  const result = JSON.parse(v.value);
  const valid =
    v.type === "integer"
      ? Number.isInteger(result)
      : v.type === "null"
        ? result === null
        : typeof result === v.type;
  if (!valid) throw Error("Vérifiez la valeur de la variable " + v.name + ".");
  return result;
}
function resolveValue(value, values) {
  if (typeof value === "string") {
    const exact = value.match(/^\{\{(\w+)\}\}$/);
    if (exact && Object.hasOwn(values, exact[1])) return values[exact[1]];
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => {
      if (!Object.hasOwn(values, name))
        throw Error("Variable inconnue : " + name);
      return String(values[name]);
    });
  }
  if (Array.isArray(value)) return value.map((x) => resolveValue(x, values));
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveValue(v, values)]),
    );
  return value;
}
function read() {
  const type = byId("mime").value,
    raw = byId("body").value,
    code = Number(byId("status").value),
    empty = byId("nobody").checked;
  if (!Number.isInteger(code) || code < 200 || code > 599)
    throw Error("Choisissez un statut HTTP de 200 à 599.");
  if ([204, 205, 304].includes(code) && !empty)
    throw Error("Ce statut exige une réponse sans corps.");
  if (!byId("route").value.startsWith("/") || !byId("name").value.trim())
    throw Error("Vérifiez le nom et le chemin dans Paramètres.");
  const values = Object.create(null);
  for (const v of variables) {
    if (!/^[A-Za-z_]\w*$/.test(v.name) || Object.hasOwn(values, v.name))
      throw Error("Chaque variable doit avoir un nom unique et valide.");
    values[v.name] = variableValue(v);
  }
  let body = "";
  if (!empty && type.includes("json")) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw Error("JSON invalide dans le corps de la réponse.");
    }
    body = JSON.stringify(resolveValue(data, values), null, 2);
  } else if (!empty) {
    const xml = type.endsWith("/xml");
    body = raw.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = String(resolveValue("{{" + key + "}}", values));
      return xml
        ? value.replace(
            /[<>&"']/g,
            (c) =>
              ({
                "<": "&lt;",
                ">": "&gt;",
                "&": "&amp;",
                '"': "&quot;",
                "'": "&apos;",
              })[c],
          )
        : value;
    });
    if (
      xml &&
      (new DOMParser()
        .parseFromString(body, "application/xml")
        .querySelector("parsererror") ||
        /<!DOCTYPE/i.test(body))
    )
      throw Error("XML invalide dans le corps de la réponse.");
  }
  let headers;
  try {
    headers = JSON.parse(byId("headers").value);
    if (!headers || Array.isArray(headers) || typeof headers !== "object")
      throw Error();
  } catch {
    throw Error("Les en-têtes doivent former un objet JSON.");
  }
  if (byId("enable-hook").checked) {
    if (!URL.canParse(byId("endpoint").value))
      throw Error("Renseignez l’URL de réception du webhook.");
    if (byId("delay").value === "" || !byId("delay").validity.valid)
      throw Error("Vérifiez le délai du webhook.");
    try {
      JSON.parse(byId("hook-body").value);
      JSON.parse(byId("hook-headers").value);
    } catch {
      throw Error("Vérifiez le JSON du webhook.");
    }
  }
  return {
    body: empty ? "(sans corps)" : body,
    code,
    type,
    headers,
    method: byId("method").value,
    path: byId("route").value,
  };
}
function highlight(target, text, json) {
  target.replaceChildren();
  const parts = json ? text.split(/("(?:\\.|[^"\\])*")/g) : [text];
  parts.forEach((part, i) => {
    const span = document.createElement("span");
    span.textContent = part;
    if (i % 2) span.className = parts[i + 1]?.startsWith(":") ? "key" : "value";
    target.append(span);
  });
}
function render() {
  byId("title").textContent = byId("name").value || "Sans titre";
  byId("verb").textContent = byId("method").value;
  byId("path").textContent = byId("route").value;
  const type = byId("mime").value,
    json = type.includes("json"),
    empty = byId("nobody").checked;
  byId("format").textContent = json
    ? "JSON"
    : type.endsWith("/xml")
      ? "XML"
      : "TEXTE";
  byId("body").disabled = empty;
  byId("insert").disabled = empty;
  byId("indent").disabled = !json || empty;
  byId("nums").textContent = byId("body")
    .value.split("\n")
    .map((_, i) => i + 1)
    .join("\n");
  byId("hook-fields").hidden = !byId("enable-hook").checked;
  byId("http").textContent = "HTTP " + byId("status").value;
  byId("preview-mime").textContent = empty ? "" : type;
  try {
    const current = read();
    const headers = Object.entries(current.headers);
    byId("preview-headers").hidden = !headers.length;
    byId("header-lines").textContent = headers
      .map(([name, value]) => name + ": " + value)
      .join("\n");
    highlight(byId("preview-code"), current.body, json);
    byId("error").hidden = true;
  } catch (e) {
    byId("preview-headers").hidden = true;
    byId("preview-code").textContent = e.message;
    byId("error").hidden = false;
    byId("error").textContent = e.message;
  }
}
document.querySelector("main .form").addEventListener("input", (e) => {
  if (e.target.id !== "insert") change();
});
byId("body").onscroll = () => {
  byId("nums").scrollTop = byId("body").scrollTop;
};
byId("indent").onclick = () => {
  try {
    byId("body").value = JSON.stringify(
      JSON.parse(byId("body").value),
      null,
      2,
    );
    change();
  } catch {
    message("Corrigez le JSON avant de l’indenter.");
  }
};
function field(label, control) {
  const wrapper = document.createElement("label");
  wrapper.append(label, control);
  return wrapper;
}
function variableControls() {
  const host = byId("varlist");
  host.replaceChildren();
  byId("novars").hidden = !!variables.length;
  const select = byId("insert");
  select.replaceChildren(new Option("Insérer une variable…", ""));
  variables.forEach((v, i) => {
    select.add(new Option(v.name, String(i)));
    const section = document.createElement("div");
    section.className = "var";
    const group = document.createElement("div");
    group.className = "fields";
    const name = document.createElement("input");
    name.value = v.name;
    name.oninput = () => {
      v.name = name.value;
      select.options[i + 1].text = v.name;
    };
    const type = document.createElement("select");
    for (const t of ["string", "integer", "number", "boolean", "null"])
      type.add(new Option(t, t));
    type.value = v.type;
    type.oninput = () => {
      v.type = type.value;
    };
    const value = document.createElement("input");
    value.value = v.value;
    value.oninput = () => {
      v.value = value.value;
    };
    group.append(field("Nom de la variable", name), field("Type JSON", type));
    const row = document.createElement("div");
    row.className = "buttons";
    const use = document.createElement("button");
    use.className = "btn";
    use.textContent = "Insérer dans le corps";
    use.onclick = () => insert(v);
    const remove = document.createElement("button");
    remove.className = "text";
    remove.textContent = "Supprimer";
    remove.onclick = () => {
      variables.splice(i, 1);
      variableControls();
      change();
    };
    row.append(use, remove);
    section.append(group, field("Valeur fixe", value), row);
    host.append(section);
  });
  select.add(new Option("Créer une variable…", "new"));
}
function addVar() {
  let n = variables.length + 1;
  while (variables.some((v) => v.name === "variable" + n)) n++;
  variables.push({ name: "variable" + n, type: "string", value: "exemple" });
  variableControls();
  change();
  byId("varlist").lastElementChild.querySelector("input").focus();
}
function insert(v) {
  if (!/^[A-Za-z_]\w*$/.test(v.name))
    return message("Donnez un nom valide à la variable.");
  const area = byId("body"),
    token = "{{" + v.name + "}}";
  if (byId("mime").value.includes("json")) {
    try {
      const obj = JSON.parse(area.value);
      if (Array.isArray(obj)) obj.push(token);
      else if (obj && typeof obj === "object") {
        if (Object.hasOwn(obj, v.name)) return message("Ce champ existe déjà.");
        Object.defineProperty(obj, v.name, { value: token, enumerable: true });
      } else return message("Sélectionnez un objet ou un tableau JSON.");
      area.value = JSON.stringify(obj, null, 2);
    } catch {
      return message("Le corps doit contenir un JSON valide.");
    }
  } else
    area.setRangeText(token, area.selectionStart, area.selectionEnd, "end");
  selectTab(byId("tab-response"));
  selectTab(byId("tab-body"));
  change();
  area.focus();
}
byId("insert").onchange = (e) => {
  const k = e.target.value;
  e.target.value = "";
  if (k === "new") {
    selectTab(byId("tab-variables"));
    addVar();
  } else if (k !== "") insert(variables[Number(k)]);
};
byId("add-var").onclick = addVar;
function dialog(title, build) {
  byId("dialog-title").textContent = title;
  const host = byId("dialog-body");
  host.replaceChildren();
  build(host);
  byId("dialog").showModal();
}
function line(host, tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  host.append(el);
  return el;
}
function action(host, text, fn) {
  const b = line(host, "button", text);
  b.className = "btn primary";
  b.onclick = fn;
}
byId("save").onclick = () => {
  clean();
  message("Brouillon enregistré dans la maquette.");
};
byId("publish").onclick = () => {
  let config;
  try {
    config = read();
  } catch (e) {
    byId("error").hidden = false;
    message(e.message);
    return;
  }
  const next = versions.length + 1;
  dialog("Publier la version v" + next, (host) => {
    line(
      host,
      "p",
      config.method + " " + config.path + " → HTTP " + config.code,
    );
    line(host, "pre", config.body);
    action(host, "Confirmer la publication", () => {
      versions.push(config);
      clean();
      updateActive();
      byId("dialog").close();
      message("Version v" + next + " publiée dans la maquette.");
    });
  });
};
function updateActive() {
  const v = versions.at(-1),
    n = versions.length;
  byId("live").textContent = "v" + n + " active";
  byId("active-method").textContent = v.method;
  byId("active-path").textContent = v.path;
  byId("test").lastChild.textContent = " Tester v" + n;
}
byId("test").onclick = () =>
  dialog("Test de la version v" + versions.length, (host) => {
    const v = versions.at(-1);
    line(host, "p", v.method + " " + v.path + " → HTTP " + v.code);
    line(host, "pre", v.body);
    line(host, "p", "Résultat simulé localement.");
  });
byId("versions").onclick = () =>
  dialog("Publications", (host) =>
    versions
      .slice()
      .reverse()
      .forEach((v, i) => {
        const d = document.createElement("details");
        line(d, "summary", "v" + (versions.length - i) + " · HTTP " + v.code);
        line(d, "pre", v.body);
        host.append(d);
      }),
  );
byId("curl").onclick = async () => {
  const v = versions.at(-1);
  try {
    await navigator.clipboard.writeText(
      "curl -X " +
        v.method +
        ' -H "X-Lab-Key: $RELAIS_TEST_KEY" "https://relais.example.test/simulate/987212e5-fb30-49db-9026-8350af684868' +
        encodeURI(v.path) +
        '"',
    );
    message("Commande d’exemple copiée.");
  } catch {
    message("Copie indisponible.");
  }
};
byId("share").onclick = () =>
  dialog("Partager la simulation", (host) => {
    line(host, "p", "Lien de cette maquette");
    const input = document.createElement("input");
    input.value = location.href;
    input.readOnly = true;
    input.setAttribute("aria-label", "Lien de la maquette");
    host.append(input);
    input.focus();
    input.select();
  });
byId("show-preview").onclick = () => {
  byId("preview-sheet").append(preview);
  byId("preview-sheet").showModal();
};
byId("hide-preview").onclick = () => byId("preview-sheet").close();
byId("preview-sheet").addEventListener("close", () =>
  byId("rail").append(preview),
);
mobile.addEventListener("change", () => {
  if (!mobile.matches && byId("preview-sheet").open)
    byId("preview-sheet").close();
});
byId("close-dialog").onclick = () => byId("dialog").close();
const menu = document.querySelector(".navBtn");
menu.onclick = () =>
  menu.setAttribute(
    "aria-expanded",
    String(byId("nav").classList.toggle("open")),
  );
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && menu.getAttribute("aria-expanded") === "true") {
    menu.click();
    menu.focus();
  }
});
variableControls();
versions.push(read());
updateActive();
render();
