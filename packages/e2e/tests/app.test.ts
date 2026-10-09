import { expect, test } from "@playwright/test";

test.describe("full user flow", () => {
  test.beforeEach(async ({ request, page }) => {
    await request.post("http://localhost:3100/api/__reset");
    const serverLunchtime = new Date();
    serverLunchtime.setHours(13, 0, 0, 0);
    await page.clock.setFixedTime(serverLunchtime);
  });

  test("configure settings, calculate a meal, check history", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Musa");

    await page.getByRole("navigation").getByText("Settings").click();
    for (const name of ["morning", "lunch", "dinner"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }

    // Navigate to calculator
    await page.getByRole("navigation").getByText("Calculate").click();

    // Enter a food description
    await page.locator("textarea").fill("150g rice with chicken");

    // Submit the form
    await page.getByRole("button", { name: "Calculate dose" }).click();

    // Wait for result
    await expect(page.locator(".dose")).toBeVisible({ timeout: 5000 });

    await expect(page.locator(".food")).toHaveCount(2);
    const recommended = await page.locator(".dose-total b").textContent();
    await page.getByRole("button", { name: "0.5 U more" }).click();
    const injected = String(Number(recommended) + 0.5);
    await page
      .getByRole("button", { name: `Log meal and ${injected} U` })
      .click();
    await expect(page.getByText(`meal and ${injected} U`)).toBeVisible();

    // Go to history
    await page.getByRole("navigation").getByText("History").click();

    const meals = page.locator('.history-entry[data-entry-type="meal"]');
    await expect(meals).toHaveCount(1);
    await expect(
      page.locator('.history-entry[data-entry-type="fast_insulin"]'),
    ).toContainText(`${injected}`);
    await expect(meals.locator(".history-summary")).toContainText(
      "150g rice with chicken",
    );

    await meals.locator(".history-entry-header").click();
    await expect(meals.locator(".history-actions")).toBeVisible();

    await meals.locator(".history-actions").getByText("Delete").click();
    await expect(meals).toHaveCount(0);
  });

  test("language switch to Spanish", async ({ page }) => {
    await page.goto("/");

    // Go to settings and switch to Spanish
    await page.getByRole("navigation").getByText("Settings").click();
    await page.getByText("Español", { exact: true }).click();

    // After save, UI should switch to Spanish
    await expect(
      page.getByRole("navigation").getByText("Calcular"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation").getByText("Historial"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation").getByText("Ajustes"),
    ).toBeVisible();
  });

  test("reuse a history entry", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("a banana");
    await page.getByRole("button", { name: "Calculate dose" }).click();
    await page.getByRole("button", { name: /Log meal/ }).click();

    // Go to history
    await page.getByRole("navigation").getByText("History").click();
    const meals = page.locator('.history-entry[data-entry-type="meal"]');
    await expect(meals).toHaveCount(1);

    // Expand and reuse
    await meals.locator(".history-entry-header").click();
    await page.getByRole("button", { name: "Use again" }).click();

    // Should be back on calculator with the text pre-filled
    await expect(page.locator("textarea")).toHaveValue("a banana");
  });

  test("shows estimated badge for unknown foods", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("100g something exotic");
    await page.getByRole("button", { name: "Calculate dose" }).click();
    await expect(page.locator(".dose")).toBeVisible({ timeout: 5000 });

    await expect(page.locator(".estimated-badge")).toBeVisible();
  });

  test("correction bolus appears when blood sugar is entered", async ({
    page,
  }) => {
    await page.goto("/");

    // Configure a correction factor in settings
    await page.getByRole("navigation").getByText("Settings").click();

    await page.getByRole("button", { name: /Correction factor/ }).click();
    await page.getByLabel("Glucose drop per 1 U").fill("40");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(
      page.getByRole("button", { name: /Correction factor/ }),
    ).toContainText("40 mg/dL");

    // Go to calculator
    await page.getByRole("navigation").getByText("Calculate").click();

    await page.getByRole("button", { name: "Current glucose" }).click();
    await page.getByLabel(/Read it from your meter/).fill("180");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.locator(".sensor-correction")).toHaveText("+2 U");

    await page.locator("textarea").fill("a banana");
    await page.getByRole("button", { name: "Calculate dose" }).click();

    await expect(page.locator(".dose")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".dose-parts")).toContainText("+2 U");
  });

  test("meal windows keep the whole day covered while editing", async ({
    page,
  }) => {
    await page.goto("/settings");

    await page.getByRole("button", { name: /lunch/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Ends at").selectOption({ label: "18:00" });
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: /dinner/ })).toContainText(
      "18:00–06:00",
    );

    await page.getByRole("button", { name: /lunch/ }).click();
    await sheet.getByRole("button", { name: "Delete window" }).click();
    await expect(page.getByRole("button", { name: /morning/ })).toContainText(
      "06:00–18:00",
    );
    await expect(page.getByText(/No window covers/)).toHaveCount(0);
  });

  test("sheets close by dragging down or tapping the handle", async ({
    page,
  }) => {
    await page.goto("/settings");
    const sheet = page.getByRole("dialog");

    await page.getByRole("button", { name: /Target blood sugar/ }).click();
    await expect(sheet).toBeVisible();
    const handle = sheet.getByRole("button", { name: "Close" });
    await handle.hover();
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle not rendered");
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 10 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: /Target blood sugar/ }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
  });
});
