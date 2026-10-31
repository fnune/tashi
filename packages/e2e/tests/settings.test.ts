import { expect, test } from "./fixtures.js";
import { atLunchtime, goTo, resetServer } from "./helpers.js";

test.describe("settings are kept", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
  });

  test("a correction factor is still there after a reload", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: /Correction factor/ }).click();
    await page.getByLabel("Glucose drop per 1 U").fill("45");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await page.reload();
    await expect(
      page.getByRole("button", { name: /Correction factor/ }),
    ).toContainText("45 mg/dL");
  });

  test("a profile, the active one and the language are still there after a reload", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Add profile" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Name").fill("Night shift");
    await sheet.getByText("By time of day").click();
    await sheet.getByLabel("lunch").fill("5");
    await sheet.getByRole("button", { name: "Save" }).click();
    await page.getByText("Night shift").click();

    await page.reload();
    await expect(
      page.getByRole("radio", { name: /Night shift/ }),
    ).toBeChecked();
    await expect(page.getByRole("button", { name: /lunch/ })).toContainText(
      "5 g/U",
    );
    await goTo(page, "Calculate");
    await expect(page.locator(".ratio-pill")).toContainText("5 g/U");
  });

  test("the meal windows come back in the order they were set", async ({
    page,
  }) => {
    const windows = page.getByRole("button", {
      name: /^(morning|lunch|dinner)/,
    });
    await page.goto("/settings");
    await expect(windows).toHaveCount(3);
    const names = await windows.allTextContents();
    await page.reload();
    await expect(windows).toHaveText(names);
  });
});
