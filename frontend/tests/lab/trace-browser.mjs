import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openDatabase } from "../../src/lab/server/db.mjs";
import { deliverOne } from "../../src/lab/server/outbox.mjs";

/** Exercise the inspector on persisted runs, including the worker's replay state transition. */
export async function exerciseTrace(context, origin, env) {
  const page = await context.newPage();
  const api = origin + "/api/lab/";
  const { items } = await (await context.request.get(api + "workspace")).json();
  async function openRun(name, raw) {
    const item = items.find((item) => item.draft.name === name);
    const response = await context.request.post(
      api + "scenarios/" + item.id + "/run",
      { data: { raw } },
    );
    expect(response.ok()).toBe(true);
    const { id } = await response.json();
    await page.goto(origin + "/#/runs/" + id);
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    return id;
  }
  try {
    const id = await openRun(
      "Refus explicite",
      '{"client":"recette","password":"prive"}',
    );
    const tab = (name) => page.getByRole("tab", { name, exact: true });
    const sidebar = page.locator("aside.sidebar");
    const originalMenu = await sidebar.elementHandle();
    await sidebar.getByRole("link", { name: "Exécutions" }).click();
    await page.locator('a[href="#/runs/' + id + '"]').click();
    expect(
      await originalMenu.evaluate(
        (node) => node === document.querySelector("aside.sidebar"),
      ),
    ).toBe(true);
    const panel = page.getByRole("tabpanel");
    await expect(tab("Réponse")).toHaveAttribute("aria-selected", "true");
    await expect(panel).toContainText("REQUEST_REJECTED");
    await expect(tab("Webhook")).toHaveCount(0);
    await expect(
      page.locator("header").getByText("422", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("main dd").filter({ hasText: /^Atlas$/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copier le contenu affiché" })
      .click();
    expect(
      JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
    ).toEqual({ etat: "refused", code: "REQUEST_REJECTED" });
    await expect(
      page.locator("aside.sidebar nav a[aria-current=page]"),
    ).toHaveText("Exécutions");
    await tab("En-têtes").click();
    await expect(panel.getByRole("heading", { name: "Requête" })).toBeVisible();
    await expect(
      panel.getByText("content-type", { exact: true }),
    ).toBeVisible();
    await tab("Réponse").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab("Requête")).toBeFocused();
    await expect(panel).toContainText("[masqué]");
    await expect(panel).not.toContainText("prive");
    await page.keyboard.press("ArrowRight");
    await expect(tab("Variables")).toBeFocused();
    await expect(panel).toContainText("{}");
    const refresh = page.waitForResponse(
      (r) => r.url() === api + "runs/" + id && r.ok(),
    );
    await page.getByRole("button", { name: "Actualiser la trace" }).click();
    await refresh;
    await expect(page.getByRole("status")).toContainText("Trace actualisée");
    await expect(tab("Variables")).toHaveAttribute("aria-selected", "true");
    await tab("Variables").focus();
    await page.keyboard.press("Home");
    for (const width of [1360, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 865 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(width);
      const inspect = await panel.boundingBox(),
        timeline = await page
          .getByRole("heading", { name: "Chronologie" })
          .boundingBox();
      if (width <= 390)
        expect(timeline.y).toBeGreaterThan(inspect.y + inspect.height);
      else expect(timeline.x).toBeGreaterThanOrEqual(inspect.x + inspect.width);
    }
    const menu = page.getByRole("button", { name: "Ouvrir le menu" });
    await menu.click();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await page.getByRole("link", { name: "Refus explicite" }).click();
    // Inspect the active simulation at phone width without saving changes to the fixture.
    await expect(tab("Réponse")).toHaveAttribute("aria-selected", "true");
    await tab("Corps").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("En-têtes JSON")).toBeVisible();
    await tab("Corps").click();
    await page
      .getByLabel("Corps de la réponse", { exact: true })
      .fill('{"mobile":true}');
    const opener = page.getByRole("button", { name: "Aperçu", exact: true });
    await opener.click();
    const sheet = page.getByRole("dialog", { name: "Aperçu du brouillon" });
    await expect(sheet).toContainText('"mobile": true');
    await sheet.getByRole("button", { name: "Historique" }).click();
    const history = page.getByRole("dialog", {
      name: "Historique des publications",
    });
    await history.locator("summary").first().click();
    await expect(history).toContainText("REQUEST_REJECTED");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 320);
    await tab("Paramètres").click();
    await expect(page.getByLabel("Nom de la simulation")).toHaveValue(
      "Refus explicite",
    );
    await page.goBack();
    await expect(tab("Réponse")).toBeVisible();
    const jobRun = await openRun("Génération de document", "");
    await tab("En-têtes").click();
    await expect(panel.getByRole("heading", { name: "Webhook" })).toBeVisible();
    await tab("Webhook").click();
    await expect(panel).toContainText("success");
    await tab("Requête").click();
    await expect(panel).toContainText("Aucun corps reçu");
    await expect(
      panel.getByRole("button", { name: "Copier le contenu affiché" }),
    ).toHaveCount(0);
    const proof = await (
      await context.request.get(api + "runs/" + jobRun)
    ).json();
    // Only advance this ephemeral queue. A deterministic receiver acknowledges both deliveries.
    const db = openDatabase(env.RELAIS_DB),
      targets = JSON.parse(readFileSync(env.RELAIS_DESTINATIONS, "utf8"));
    try {
      const acknowledge = async () => 204;
      expect(
        await deliverOne(db, targets, acknowledge, proof.job.planned),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Rejouer la notification" }),
      ).toBeVisible({ timeout: 8000 });
      const replay = page.getByRole("button", {
        name: "Rejouer la notification",
      });
      page.once("dialog", (d) => d.dismiss());
      await replay.click();
      await expect(replay).toBeVisible();
      page.once("dialog", (d) => d.accept());
      await replay.click();
      await expect(page.getByText("Doublon de recette demandé")).toBeVisible();
      expect(await deliverOne(db, targets, acknowledge)).toBe(true);
      await expect(page.getByText(/Tentative 2.*HTTP 204/)).toBeVisible({
        timeout: 8000,
      });
      await expect(replay).toHaveCount(0);
    } finally {
      db.close();
    }
  } finally {
    await page.close();
  }
}
