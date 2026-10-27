import { expect, test } from "@playwright/test";
import { atLunchtime, resetServer, SERVER } from "./helpers.js";

test.describe("history", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
  });

  test("shows every entry however many there are", async ({
    request,
    page,
  }) => {
    for (let i = 0; i < 230; i++) {
      await request.post(`${SERVER}/api/timeline`, {
        data: { type: "glucose_reading", value: 100 + (i % 50), unit: "mg/dL" },
      });
    }
    await page.goto("/timeline");
    await expect(
      page.locator('.event[data-entry-type="glucose_reading"]'),
    ).toHaveCount(230);
  });

  test("clearing the history removes everything after confirming", async ({
    request,
    page,
  }) => {
    await request.post(`${SERVER}/api/timeline`, {
      data: { type: "slow_insulin", units: 10 },
    });
    await page.goto("/timeline");
    await expect(page.locator(".event")).toHaveCount(1);
    await page.getByRole("button", { name: "Clear history" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Clear history" })
      .click();
    await expect(page.locator(".event")).toHaveCount(0);
  });
});

test.describe("entries in another time zone", () => {
  test.use({ timezoneId: "Asia/Tokyo" });

  test("remember the zone they were logged in", async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
    await page.goto("/");
    await page.locator("textarea").fill("150g rice");
    await page.getByRole("button", { name: "Calculate dose" }).click();
    await page.getByRole("button", { name: /^Log / }).click();
    await expect(page.getByText(/Logged in history/)).toBeVisible();

    const response = await request.get(`${SERVER}/api/timeline`);
    const body = (await response.json()) as {
      entries: { type: string; time_zone: string }[];
    };
    expect(body.entries.length).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(entry.time_zone).toBe("Asia/Tokyo");
    }
  });
});
