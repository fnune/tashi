import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { atLunchtime, resetServer, SERVER } from "./helpers.js";

test.describe("history", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
  });

  async function addReadings(request: APIRequestContext, count: number) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const response = await request.post(`${SERVER}/api/timeline`, {
        data: {
          type: "glucose_reading",
          value: 100 + (i % 50),
          unit: "mg/dL",
          timestamp: new Date(Date.UTC(2026, 5, 1, 8, i)).toISOString(),
        },
      });
      ids.push(((await response.json()) as { id: string }).id);
    }
    return ids;
  }

  async function scrollUntilLoaded(page: Page, count: number) {
    await expect(async () => {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      );
      await expect(entries(page)).toHaveCount(count, { timeout: 500 });
    }).toPass();
  }

  const entries = (page: Page) =>
    page.locator('.event[data-entry-type="glucose_reading"]');

  test("loads the next page when the end of the list comes into view", async ({
    request,
    page,
  }) => {
    await addReadings(request, 130);
    await page.goto("/timeline");
    await expect(entries(page)).toHaveCount(50);

    await scrollUntilLoaded(page, 130);
  });

  test("reaches every entry however many there are", async ({
    request,
    page,
  }) => {
    await addReadings(request, 230);
    await page.goto("/timeline");
    await scrollUntilLoaded(page, 230);
  });

  test("stops asking once the whole history is there", async ({
    request,
    page,
  }) => {
    await addReadings(request, 120);
    const pageRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/timeline?")) pageRequests.push(r.url());
    });
    await page.goto("/timeline");
    const clear = page.getByRole("button", { name: "Clear history" });
    await expect(clear).toBeHidden();

    await scrollUntilLoaded(page, 120);
    await expect(clear).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.waitForTimeout(300);
    expect(pageRequests).toHaveLength(3);
  });

  test("keeps the pages that were loaded after an entry is edited", async ({
    request,
    page,
  }) => {
    await addReadings(request, 130);
    await page.goto("/timeline");
    await scrollUntilLoaded(page, 130);
    await page.evaluate(() => window.scrollTo(0, 0));

    await entries(page).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Glucose").fill("222");
    await sheet.getByRole("button", { name: "Save" }).click();

    await expect(sheet).toBeHidden();
    await expect(entries(page).first()).toContainText("222");
    await expect(entries(page)).toHaveCount(130);
  });

  test("opens an entry from its link even when it is far down the history", async ({
    request,
    page,
  }) => {
    const ids = await addReadings(request, 120);
    await page.goto(`/timeline/${ids[0]}`);
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByLabel("Glucose")).toHaveValue("100");
  });

  test("offers a retry when a page cannot be loaded", async ({
    request,
    page,
  }) => {
    await addReadings(request, 120);
    await page.route("**/api/timeline?*cursor=*", (route) => route.abort());
    await page.goto("/timeline");
    await expect(entries(page)).toHaveCount(50);
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(page.getByText("Could not load more.")).toBeVisible();
    await expect(entries(page)).toHaveCount(50);

    await page.unroute("**/api/timeline?*cursor=*");
    await page.getByRole("button", { name: "Try again" }).click();
    await scrollUntilLoaded(page, 120);
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
