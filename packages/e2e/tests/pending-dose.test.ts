import { expect, test } from "./fixtures.js";
import { atLunchtime, goTo, resetServer } from "./helpers.js";

test.describe("a dose that was not logged yet", () => {
  test.beforeEach(async ({ request, page }) => {
    await resetServer(request);
    await atLunchtime(page);
  });

  test("is still there after the app is opened again", async ({ page }) => {
    await page.goto("/");
    await page.locator("textarea").fill("150g rice");
    await page.getByRole("button", { name: "Calculate dose" }).click();
    await expect(page.getByRole("button", { name: /^Log / })).toBeVisible();

    await goTo(page, "History");
    await expect(
      page.getByRole("navigation").getByText("A dose is waiting to be logged"),
    ).toBeAttached();
    await page.reload();
    await page.goto("/");

    await expect(page.getByRole("button", { name: /^Log / })).toBeVisible();
    await expect(page.getByText("150g rice")).toBeVisible();
    await page.getByRole("button", { name: /^Log / }).click();
    await expect(page.getByText(/Logged in history/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /^Log / })).toBeHidden();
  });

  test("is logged at the time it was calculated when logged later", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await page.locator("textarea").fill("150g rice");
    await page.getByRole("button", { name: "Calculate dose" }).click();
    await expect(page.getByRole("button", { name: /^Log / })).toBeVisible();
    const calculatedAt = await page.evaluate(() => new Date().toISOString());

    const later = new Date(Date.parse(calculatedAt) + 45 * 60_000);
    await page.clock.setFixedTime(later);
    await page.reload();

    await expect(page.getByText(/not logged yet/)).toBeVisible();
    await page.getByRole("button", { name: /^Log / }).click();
    await expect(page.getByText(/Logged in history/)).toBeVisible();

    const timeline = (await (await request.get(`/api/timeline`)).json()) as {
      entries: { type: string; timestamp: string }[];
    };
    const insulin = timeline.entries.find((e) => e.type === "fast_insulin");
    expect(insulin?.timestamp).toBe(
      new Date(
        Math.floor(Date.parse(calculatedAt) / 60_000) * 60_000,
      ).toISOString(),
    );
  });
});
