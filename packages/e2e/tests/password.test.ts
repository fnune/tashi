import { expect, test } from "@playwright/test";
import { GATED_SERVER } from "./helpers.js";

test.describe("a server with a password", () => {
  test("refuses requests without it", async ({ request }) => {
    const page = await request.get(`${GATED_SERVER}/`);
    expect(page.status()).toBe(401);
    const api = await request.get(`${GATED_SERVER}/api/settings`);
    expect(api.status()).toBe(401);
  });

  test("refuses a wrong password", async ({ request }) => {
    const response = await request.get(`${GATED_SERVER}/api/settings`, {
      headers: { Authorization: `Basic ${btoa("me:nope")}` },
    });
    expect(response.status()).toBe(401);
  });

  test.describe("signed in", () => {
    test.use({
      baseURL: GATED_SERVER,
      httpCredentials: { username: "anyone", password: "e2e-password" },
    });

    test("opens the app", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator("h1")).toHaveText("Tashi");
    });
  });
});
