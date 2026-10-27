import { expect, test } from "@playwright/test";
import { atLunchtime, goTo, resetServer, SERVER } from "./helpers.js";

test.describe("insulin on board", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
    const settings = await (await request.get(`${SERVER}/api/settings`)).json();
    await request.put(`${SERVER}/api/settings`, {
      data: { ...settings, correction_factor: 40, insulin_action_minutes: 300 },
    });
  });

  test("a recent dose is counted and takes the edge off a correction", async ({
    request,
    page,
  }) => {
    await request.post(`${SERVER}/api/timeline`, {
      data: { type: "fast_insulin", units: 4 },
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Add glucose" }).click();
    await page.getByRole("dialog").getByLabel("Glucose").fill("180");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();

    await expect(page.locator(".sensor-correction")).toHaveText("0 U");
    await expect(page.locator(".sensor")).toContainText("on board");
  });

  test("with nothing on board the whole correction is suggested", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Add glucose" }).click();
    await page.getByRole("dialog").getByLabel("Glucose").fill("180");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.locator(".sensor-correction")).toHaveText("+2 U");
    await goTo(page, "History");
    await expect(page.locator(".event")).toHaveCount(1);
  });
});
