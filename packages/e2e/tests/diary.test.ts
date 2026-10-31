import { expect, test } from "./fixtures.js";
import { atLunchtime, resetServer } from "./helpers.js";

test.describe("a copy of the diary", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
  });

  test("brings the history back after everything was cleared", async ({
    request,
    page,
  }, testInfo) => {
    for (let i = 0; i < 30; i++) {
      await request.post(`/api/timeline`, {
        data: {
          type: "glucose_reading",
          value: 100 + i,
          unit: "mg/dL",
          timestamp: new Date(Date.UTC(2026, 5, 1, 8, i)).toISOString(),
        },
      });
    }

    await page.goto("/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download a copy/ }).click();
    const file = testInfo.outputPath("tashi.json");
    await (await download).saveAs(file);

    await resetServer(request);
    await page.reload();
    await page.locator(".diary-settings input[type=file]").setInputFiles(file);
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("30");
    await sheet.getByRole("button", { name: "Replace" }).click();
    await expect(sheet).toContainText("Your copy is loaded.");

    await page.goto("/timeline");
    await expect(
      page.locator('.event[data-entry-type="glucose_reading"]'),
    ).toHaveCount(30);
  });

  test("says so when the file is not a copy from Tashi", async ({
    page,
  }, testInfo) => {
    const file = testInfo.outputPath("other.json");
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(file, JSON.stringify({ hello: "world" })),
    );
    await page.goto("/settings");
    await page.locator(".diary-settings input[type=file]").setInputFiles(file);
    await expect(
      page.getByText("This file is not a copy downloaded from Tashi."),
    ).toBeVisible();
  });
});
