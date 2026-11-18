import { expect } from "@playwright/test";

/** Runs after the trace exercise so the journal contains real persisted calls from both projects. */
export async function exerciseMonitoring(context, origin) {
  const page = await context.newPage();
  const api = origin + "/api/lab/",
    project = "Recette notifications",
    url = "http://127.0.0.1:3922/recette";
  try {
    for (const [path, data] of [
      ["projects", { name: project }],
      ["receivers", { project, url }],
    ]) {
      expect((await context.request.post(api + path, { data })).ok()).toBe(
        true,
      );
    }
    await page.goto(origin + "/#/runs");
    const rows = page.locator('main a[href^="#/runs/"]');
    await expect(rows.filter({ hasText: "Refus explicite" })).toHaveCount(1);
    const date = await page
      .getByLabel("Période")
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await page.getByLabel("Période").selectOption(date);
    await page.getByLabel("Filtrer par projet").selectOption("Studio");
    await expect(page).toHaveURL(/#\/runs$/);
    await page.getByLabel("Rechercher une simulation").fill("generation");
    await page.getByLabel("Code HTTP").selectOption("2");
    await page.getByLabel("Webhook", { exact: true }).selectOption("delivered");
    await expect(rows).toHaveCount(1);
    await rows.first().click();
    await expect(
      page.getByRole("heading", {
        name: "Génération de document",
        exact: true,
      }),
    ).toBeVisible();
    await page.goBack();
    await page.getByLabel("Code HTTP").selectOption("5");
    await page.getByRole("button", { name: "Effacer les filtres" }).click();
    await expect(page.getByLabel("Filtrer par projet")).toHaveValue("");
    await expect(rows.filter({ hasText: "Refus explicite" })).toHaveCount(1);
    for (const width of [1360, 820, 390, 320]) {
      await page.setViewportSize({ width, height: 875 });
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    }
    await page.getByRole("button", { name: "Ouvrir le menu" }).click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Notifications" })
      .click();
    await expect(
      page.getByRole("heading", { name: "État technique" }),
    ).toBeVisible();
    const tab = page.getByRole("tab", { name: /Autorisations/ });
    await page.getByRole("tab", { name: "Destinations autorisées" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab).toBeFocused();
    const panel = page.getByRole("tabpanel", { name: /Autorisations/ });
    const revoke = panel.getByRole("button", { name: "Retirer", exact: true });
    await revoke.click();
    await page.keyboard.press("Escape");
    await expect(revoke).toBeFocused();
    await revoke.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(url);
    await dialog.getByRole("button", { name: "Retirer", exact: true }).click();
    await expect(panel).toContainText(project + " · Révoquée");
    await page.reload();
    await tab.click();
    await expect(panel).toContainText(project + " · Révoquée");
    await panel.getByRole("button", { name: "Autoriser" }).click();
    await dialog
      .getByRole("button", { name: "Autoriser", exact: true })
      .click();
    await expect(panel).toContainText(project + " · Autorisée");
    await page.getByRole("tab", { name: "Destinations autorisées" }).click();
    await expect(page.getByRole("tabpanel")).toContainText(project);
    for (const width of [320, 390, 820, 1360]) {
      await page.setViewportSize({ width, height: 875 });
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    }
  } finally {
    await page.close();
  }
}
