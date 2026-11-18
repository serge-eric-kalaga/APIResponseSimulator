import { expect } from "@playwright/test";

/** Real, isolated cookie jars verify that shared links and the registered-users-only catalogue agree. */
export async function exerciseCollaboration(browser, origin) {
  const contexts = [];
  async function signup(email) {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(origin);
    await page
      .getByRole("button", { name: "Créer un compte", exact: true })
      .click();
    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Mot de passe").fill("recette-collaborative");
    await page.getByRole("button", { name: "Créer mon compte" }).click();
    await expect(
      page.getByRole("heading", { name: "Bibliothèque" }),
    ).toBeVisible();
    return page;
  }
  async function createProject(page, name) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Projets" })
      .click();
    await page.getByLabel("Nom du projet").fill(name);
    await page
      .getByRole("button", { name: "Créer le projet", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Clé de déclenchement · " + name }),
    ).toBeVisible();
    return page
      .locator(".panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Clé de déclenchement · " + name,
        }),
      })
      .locator("code")
      .innerText();
  }
  try {
    const owner = await signup("proprietaire@example.test"),
      reader = await signup("lectrice@example.test"),
      stranger = await signup("tiers@example.test");
    await createProject(reader, "Copie privée");
    const key = await createProject(owner, "Atelier été");
    const row = owner
      .locator(".resourceRow")
      .filter({ hasText: "Atelier été" });
    const projectShare = await row
      .getByRole("link", { name: "Partager" })
      .getAttribute("href");
    await row.getByRole("link", { name: "Ouvrir Atelier été" }).click();
    const projectUrl = owner.url();
    await owner.getByRole("link", { name: "Nouvelle simulation" }).click();
    await owner.getByLabel("Nom de la simulation").fill("Contrat XML");
    await owner.getByRole("tab", { name: "Réponse", exact: true }).click();
    await owner.getByLabel("Type de contenu").selectOption("application/xml");
    await owner
      .getByLabel("Corps de la réponse", { exact: true })
      .fill('<document statut="pret"/>');
    await owner.getByRole("tab", { name: "En-têtes", exact: true }).click();
    await owner.getByLabel("En-têtes JSON").fill('{"X-Recette":"xml"}');
    await owner.getByRole("tab", { name: "Webhook", exact: true }).click();
    await owner.getByLabel("Programmer une notification POST").check();
    await owner
      .getByLabel("URL de réception")
      .fill("http://127.0.0.1:3922/recette");
    await owner.getByRole("button", { name: "Enregistrer l’URL" }).click();
    await expect(
      owner.getByText("URL autorisée", { exact: true }),
    ).toBeVisible();
    await owner.getByRole("tab", { name: "En-têtes", exact: true }).click();
    await owner.getByLabel("En-têtes POST").fill("[]");
    await owner.getByRole("tab", { name: "Paramètres", exact: true }).click();
    await owner.getByRole("button", { name: "Publier une version" }).click();
    await expect(owner.getByLabel("En-têtes POST")).toBeFocused();
    await owner
      .getByLabel("En-têtes POST")
      .fill('{"X-Recette":"notification"}');
    await owner.getByRole("button", { name: "Publier une version" }).click();
    await owner.getByRole("button", { name: "Fermer", exact: true }).click();
    await expect(owner.getByRole("dialog")).toHaveCount(0);
    await expect(
      owner.getByRole("button", { name: "Exécuter la version v1" }),
    ).toHaveCount(0);
    await owner.getByRole("button", { name: "Publier une version" }).click();
    await owner
      .getByRole("button", { name: "Confirmer la publication" })
      .click();
    await expect(
      owner.getByRole("button", { name: "Exécuter la version v1" }),
    ).toBeVisible();
    const simUrl = owner.url();
    await owner.getByText("Détails de l’appel test", { exact: true }).click();
    const endpoint = await owner.locator("details code.wrap").innerText();
    const r = await owner.request.post(endpoint, {
      headers: { "x-lab-key": key },
    });
    expect(r.status()).toBe(200);
    expect(r.headers()["x-recette"]).toBe("xml");
    expect(r.headers()["content-type"]).toBe("application/xml");
    expect(await r.text()).toBe('<document statut="pret"/>');
    await owner.getByRole("tab", { name: "Paramètres", exact: true }).click();
    await owner.getByRole("link", { name: "Partager la simulation" }).click();
    await owner
      .getByLabel("Adresse e-mail du destinataire")
      .fill("lectrice@example.test");
    await owner.getByRole("button", { name: "Donner accès" }).click();
    await expect(
      owner.getByRole("button", { name: "Retirer l’accès" }),
    ).toBeVisible();
    await reader.goto(simUrl);
    await reader.reload();
    await reader.getByRole("tab", { name: "Paramètres", exact: true }).click();
    await expect(reader.getByLabel("Nom de la simulation")).toBeDisabled();
    await stranger.goto(simUrl);
    await stranger.reload();
    await expect(stranger.getByText("Simulation introuvable.")).toBeVisible();
    await reader
      .getByRole("navigation")
      .getByRole("link", { name: "Bibliothèque" })
      .click();
    await reader
      .getByRole("button", { name: "Actions pour Contrat XML" })
      .click();
    await reader.getByRole("button", { name: "Dupliquer" }).click();
    await reader.getByRole("tab", { name: "Paramètres", exact: true }).click();
    await expect(reader.getByLabel("Nom de la simulation")).toHaveValue(
      "Contrat XML · copie",
    );
    await reader.getByRole("tab", { name: "Webhook", exact: true }).click();
    await expect(
      reader.getByLabel("Programmer une notification POST"),
    ).not.toBeChecked();
    await owner.getByRole("button", { name: "Retirer l’accès" }).click();
    await expect(
      owner.getByRole("button", { name: "Retirer l’accès" }),
    ).toHaveCount(0);
    await reader.goto(simUrl);
    await reader.reload();
    await expect(reader.getByText("Simulation introuvable.")).toBeVisible();
    await owner.goto(origin + "/" + projectShare);
    await owner.getByLabel("Visibilité").selectOption("public");
    await expect
      .poll(
        async () =>
          (
            await (
              await owner.request.get(
                origin + "/api/lab/" + projectShare.slice(2),
              )
            ).json()
          ).public,
      )
      .toBe(true);
    await stranger.goto(projectUrl);
    await stranger.reload();
    await expect(stranger.locator(".rowTitle")).toContainText("Contrat XML");
    await reader.goto(origin + "/#/health");
    await expect(
      reader.getByRole("heading", { name: "État technique" }),
    ).toBeVisible();
    await expect(
      reader.getByRole("tab", { name: /Autorisations/ }),
    ).toHaveCount(0);
    const anonymous = await browser.newContext();
    contexts.push(anonymous);
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(projectUrl);
    await expect(
      anonymousPage.getByRole("button", { name: "Se connecter", exact: true }),
    ).toBeVisible();
    const anonApi = await anonymousPage.request.get(
      origin + "/api/lab/workspace",
    );
    expect(anonApi.status()).toBe(401);
    await owner.getByLabel("Visibilité").selectOption("restricted");
    await expect
      .poll(
        async () =>
          (
            await (
              await owner.request.get(
                origin + "/api/lab/" + projectShare.slice(2),
              )
            ).json()
          ).public,
      )
      .toBe(false);
    await stranger.reload();
    await expect(
      stranger.getByText("Projet introuvable ou accès retiré."),
    ).toBeVisible();
    await reader.getByRole("button", { name: "Se déconnecter" }).click();
    await reader.getByLabel("Adresse e-mail").fill("lectrice@example.test");
    await reader.getByLabel("Mot de passe").fill("recette-collaborative");
    await reader
      .getByRole("button", { name: "Se connecter", exact: true })
      .click();
    await expect(reader.locator(".rowTitle")).toContainText(
      "Contrat XML · copie",
    );
    console.log(
      "Inscription, projets, XML HTTP, URL webhook et partage multi-comptes validés.",
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
}
