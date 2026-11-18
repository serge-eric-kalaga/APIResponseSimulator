/** Run through the public UI with an isolated database and fictional accounts. Requires npm run build. */
import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
const home = mkdtempSync(join(tmpdir(), "relais-browser-"));
const env = {
  ...process.env,
  RELAIS_HOME: home,
  RELAIS_DB: join(home, "relais.sqlite"),
  RELAIS_DESTINATIONS: join(home, "targets.json"),
};
const init = spawnSync(process.execPath, ["scripts/lab-admin.mjs", "init"], {
  env,
  stdio: "inherit",
});
if (init.status !== 0) throw Error("Initialisation de la recette impossible.");
const key = JSON.parse(
  readFileSync(join(home, "acces-pilote.json")),
).cle_interface;
const port = process.env.RELAIS_QA_PORT || "3211",
  url = "http://127.0.0.1:" + port;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", port],
  { env, stdio: "inherit" },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(200);
  }
  if (!ready || server.exitCode !== null)
    throw Error("Serveur de recette indisponible.");
  browser = await chromium.launch({
    channel:
      process.env.RELAIS_CHROME ||
      (existsSync("/Applications/Google Chrome.app") ? "chrome" : undefined),
  });
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      permissions: ["clipboard-read", "clipboard-write"],
    }),
    page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "J’ai une ancienne clé" }).click();
  await page.getByLabel("Ancienne clé d’accès").fill(key);
  await page.getByLabel("Adresse e-mail").fill("pilote@example.test");
  await page.getByLabel("Mot de passe").fill("mot-de-passe-de-recette");
  await page.getByRole("button", { name: "Associer mon compte" }).click();
  await expect(
    page.getByRole("heading", { name: "Bibliothèque" }),
  ).toBeVisible();
  await expect(page.locator(".rowTitle")).toHaveCount(4);
  if (process.env.RELAIS_SCREENSHOT)
    await page.screenshot({ path: process.env.RELAIS_SCREENSHOT });
  await page.getByLabel("Rechercher dans les simulations").fill("Webhook");
  await expect(page.locator(".rowTitle")).toHaveCount(1);
  await page.getByLabel("Rechercher dans les simulations").fill("");
  await page.getByLabel("Service simulé").selectOption("Traitements");
  await expect(page.locator(".rowTitle")).toHaveCount(2);
  await page.getByLabel("Service simulé").selectOption("");
  await page.getByLabel("Filtrer par projet").selectOption("Studio");
  await expect(page.locator(".rowTitle")).toHaveCount(1);
  await page.getByRole("link", { name: "Nouvelle simulation" }).click();
  await page.getByLabel("Nom de la simulation").fill("Recette navigateur");
  // A visual insertion must preserve the numeric type and the preview must stay offline.
  const previewRequests = [];
  const watchPreview = (req) => {
    if (req.url().includes("/api/lab/")) previewRequests.push(req.method());
  };
  page.on("request", watchPreview);
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await page.getByLabel("Nom de variable").fill("quantite");
  await page.getByLabel("Type JSON").selectOption("integer");
  await page.getByLabel("Mode", { exact: true }).selectOption("fixed");
  await page.getByLabel("Valeur fixe").fill("3");
  const editor = page.getByLabel("Corps de la réponse", { exact: true });
  await editor.fill('{"quantite":null}');
  await editor.evaluate((el) => el.setSelectionRange(12, 16));
  await page
    .getByLabel("Insérer une variable dans Corps de la réponse")
    .selectOption("quantite");
  await expect(page.locator(".codePanel")).toContainText('"quantite": 3');
  await page
    .getByRole("button", { name: "Indenter le JSON", exact: true })
    .click();
  await expect(editor).toHaveValue(/\n/);
  await page.getByLabel("Sans corps", { exact: true }).check();
  await page.getByLabel("Statut HTTP").fill("204");
  await expect(page.locator(".codePanel")).toContainText("(sans corps)");
  await page.getByLabel("Sans corps", { exact: true }).uncheck();
  await page.getByRole("button", { name: "200", exact: true }).click();
  page.off("request", watchPreview);
  if (previewRequests.length)
    throw Error("La prévisualisation a effectué un appel API.");
  await page.getByLabel("Corps de la réponse", { exact: true }).fill("{");
  await page.getByRole("button", { name: "Publier une version" }).click();
  await expect(page.locator(".editorForm .error")).toContainText(
    "JSON invalide",
  );
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();
  await expect(page).toHaveURL(/#\/editor\//);
  await page.reload();
  await expect(
    page.getByLabel("Corps de la réponse", { exact: true }),
  ).toHaveValue("{");
  await page.getByRole("button", { name: "400", exact: true }).click();
  await page.getByLabel("Programmer une notification POST").check();
  await page.getByLabel("Destination autorisée").selectOption("pilot-receiver");
  await page.getByRole("button", { name: "Publier une version" }).click();
  await page.getByRole("button", { name: "Copier le cURL" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("X-Lab-Key");
  await page.getByRole("button", { name: "Exécuter la version v1" }).click();
  await expect(
    page.getByRole("heading", { name: "Chronologie" }),
  ).toBeVisible();
  await expect(page.getByText("Réponse préparée · HTTP 400")).toBeVisible();
  await page.getByRole("button", { name: "Annuler l’envoi" }).click();
  await expect(page.getByText("Notification annulée")).toBeVisible();
  await page.getByRole("button", { name: "Copier le résumé" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Corrélation");
  const proof = page.url();
  await page.reload();
  await expect(page.getByText("Notification annulée")).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Bibliothèque" })
    .click();
  await page
    .getByRole("button", { name: "Actions pour Recette navigateur" })
    .click();
  await page.getByRole("button", { name: "Dupliquer" }).click();
  await expect(page.getByLabel("Nom de la simulation")).toHaveValue(
    "Recette navigateur · copie",
  );
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Bibliothèque" })
    .click();
  await page
    .getByRole("button", {
      name: "Actions pour Recette navigateur",
      exact: true,
    })
    .click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Archiver" }).click();
  await page.getByLabel("Statut de simulation").selectOption("Archivée");
  await expect(page.locator(".rowTitle")).toHaveCount(1);
  await page.goto(proof);
  await expect(page.getByText("Notification annulée")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel("Ouvrir le menu").click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Notifications" })
    .click();
  await expect(
    page.getByRole("heading", { name: "État technique" }),
  ).toBeVisible();
  await page.getByLabel("Ouvrir le menu").click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Bibliothèque" })
    .click();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 375);
  await page.getByRole("link", { name: "Nouvelle simulation" }).click();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 375);
  await page.getByLabel("Ouvrir le menu").click();
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Recette navigateur réussie : bibliothèque, filtres, brouillon, publication, exécution, preuves, archive et mobile.",
  );
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
  rmSync(home, { recursive: true, force: true });
}
