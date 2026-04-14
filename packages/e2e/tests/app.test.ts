import { expect, test } from "@playwright/test";

test.describe("full user flow", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("http://localhost:3100/api/__reset");
  });

  test("configure settings, calculate a meal, check history", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Pincho");

    // Go to settings
    await page.getByRole("navigation").getByText("Settings").click();

    // Verify default meal windows are present
    await expect(page.locator(".meal-window-row")).toHaveCount(3);

    // Save settings (keep English for this test)
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    // Navigate to calculator
    await page.getByRole("navigation").getByText("Calculate").click();

    // Enter a food description
    await page.locator("textarea").fill("150g rice with chicken");

    // Select a meal window explicitly so the test is deterministic
    await page.locator("#meal-window").selectOption({ index: 2 });

    // Submit the form
    await page.locator("form").getByRole("button").click();

    // Wait for result
    await expect(page.locator(".result-dose")).toBeVisible({ timeout: 5000 });

    // Verify the result table shows items (rice + chicken + total = 3 rows)
    const rows = page.locator(".result-table tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(3);

    // Check that the dose is displayed
    const doseText = await page.locator(".result-dose").textContent();
    expect(doseText).toContain("U");

    // Go to history
    await page.getByRole("navigation").getByText("History").click();

    // Verify the entry is there
    await expect(page.locator(".history-entry")).toHaveCount(1);
    await expect(page.locator(".history-summary")).toContainText(
      "150g rice with chicken",
    );

    // Expand it
    await page.locator(".history-entry-header").click();
    await expect(page.locator(".history-actions")).toBeVisible();

    // Delete it
    await page.locator(".history-actions").getByText("Delete").click();
    await expect(page.locator(".history-entry")).toHaveCount(0);
  });

  test("language switch to Spanish", async ({ page }) => {
    await page.goto("/");

    // Go to settings and switch to Spanish
    await page.getByRole("navigation").getByText("Settings").click();
    const langSelect = page.locator("select").last();
    await langSelect.selectOption("es");
    await page.getByRole("button", { name: "Save" }).click();

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

    // Calculate something first
    await page.locator("textarea").fill("a banana");
    await page.locator("#meal-window").selectOption({ index: 1 });
    await page.locator("form").getByRole("button").click();
    await expect(page.locator(".result-dose")).toBeVisible({ timeout: 5000 });

    // Go to history
    await page.getByRole("navigation").getByText("History").click();
    await expect(page.locator(".history-entry")).toHaveCount(1);

    // Expand and reuse
    await page.locator(".history-entry-header").click();
    await page.getByRole("button", { name: "Use again" }).click();

    // Should be back on calculator with the text pre-filled
    await expect(page.locator("textarea")).toHaveValue("a banana");
  });

  test("shows estimated badge for unknown foods", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("100g something exotic");
    await page.locator("#meal-window").selectOption({ index: 1 });
    await page.locator("form").getByRole("button").click();
    await expect(page.locator(".result-dose")).toBeVisible({ timeout: 5000 });

    await expect(page.locator(".estimated-badge")).toBeVisible();
  });

  test("correction bolus appears when blood sugar is entered", async ({
    page,
  }) => {
    await page.goto("/");

    // Configure a correction factor in settings
    await page.getByRole("navigation").getByText("Settings").click();

    // Fill correction factor -- it's the first input in the correction section
    const correctionInput = page
      .locator(".settings-section")
      .filter({ hasText: "Correction factor" })
      .locator("input");
    await correctionInput.fill("2.2");

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    // Go to calculator
    await page.getByRole("navigation").getByText("Calculate").click();

    await page.locator("textarea").fill("a banana");
    await page.locator("#blood-sugar").fill("10.0");
    await page.locator("#meal-window").selectOption({ index: 1 });
    await page.locator("form").getByRole("button").click();

    await expect(page.locator(".result-dose")).toBeVisible({ timeout: 5000 });
    await expect(page.locator(".correction-box")).toBeVisible();
    const correctionText = await page.locator(".correction-box").textContent();
    expect(correctionText).toContain("10");
  });
});
