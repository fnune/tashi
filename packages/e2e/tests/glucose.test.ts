import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { atLunchtime, goTo, resetServer } from "./helpers.js";

async function logReading(page: Page, value: string) {
  await page.getByRole("button", { name: "Glucose", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Glucose").fill(value);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
}

async function chooseUnit(page: Page, unit: "mg/dL" | "mmol/L") {
  await goTo(page, "Settings");
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/settings") &&
      response.request().method() === "PUT",
  );
  await page
    .getByRole("group", { name: "Glucose unit" })
    .getByText(unit)
    .click();
  await saved;
}

test.describe("glucose readings", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
  });

  test("log a reading, edit it and delete it", async ({ page }) => {
    await page.goto("/timeline");
    const readings = page.locator('.event[data-entry-type="glucose_reading"]');

    await logReading(page, "144");
    await expect(readings).toContainText("144");

    await readings.click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Glucose").fill("150");
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(readings).toContainText("150");

    await readings.click();
    await sheet.getByRole("button", { name: "Delete" }).click();
    await sheet.getByRole("button", { name: "Delete" }).click();
    await expect(readings).toHaveCount(0);
  });

  test("switching the unit shows old readings in it and switching back changes nothing", async ({
    page,
  }) => {
    await page.goto("/timeline");
    await logReading(page, "144");

    await chooseUnit(page, "mmol/L");
    await goTo(page, "History");
    await expect(
      page.locator('.event[data-entry-type="glucose_reading"]'),
    ).toContainText("8");

    await chooseUnit(page, "mg/dL");
    await goTo(page, "History");
    await expect(
      page.locator('.event[data-entry-type="glucose_reading"]'),
    ).toContainText("144");
  });

  test("a reading typed in mmol/L is stored as the same glucose in mg/dL", async ({
    request,
    page,
  }) => {
    await page.goto("/timeline");
    await chooseUnit(page, "mmol/L");
    await goTo(page, "History");
    await logReading(page, "6.4");

    await chooseUnit(page, "mg/dL");
    await goTo(page, "History");
    await expect(
      page.locator('.event[data-entry-type="glucose_reading"]'),
    ).toContainText("115");

    const page1 = await request.get(`/api/timeline`);
    const body = (await page1.json()) as { entries: { value: number }[] };
    expect(body.entries[0]?.value).toBeCloseTo(115.3, 1);
  });
});
