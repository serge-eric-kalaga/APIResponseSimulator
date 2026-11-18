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
    const panel = page.getByRole("tabpanel");
    await expect(tab("Réponse")).toHaveAttribute("aria-selected", "true");
    await expect(panel).toContainText("REQUEST_REJECTED");
    await expect(tab("Webhook")).toHaveCount(0);
    await expect(
      page.locator("header").getByText("422", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("header").getByText("Atlas", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Copier le contenu affiché" })
      .click();
    expect(
      JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
    ).toEqual({ etat: "refused", code: "REQUEST_REJECTED" });
    await page.getByText("En-têtes HTTP", { exact: true }).click();
    await expect(
      panel.getByText("content-type", { exact: true }),
    ).toBeVisible();
    await tab("Réponse").focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab("Requête")).toBeFocused();
    await expect(panel).toContainText("[masqué]");
    await expect(panel).not.toContainText("prive");
    await page.keyboard.press("End");
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
    await expect(page.getByLabel("Nom de la simulation")).toHaveValue(
      "Refus explicite",
    );
    await page.goBack();
    await expect(tab("Réponse")).toBeVisible();
    const jobRun = await openRun("Génération de document", "");
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
