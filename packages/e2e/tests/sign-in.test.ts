import { expect, test } from "@playwright/test";
import { GATED_SERVER } from "./helpers.js";

const SETUP_TOKEN = "e2e-setup-token";

test.describe("setting up and signing in", () => {
  test.use({ baseURL: GATED_SERVER });

  test.beforeEach(async ({ request }) => {
    await request.post(`${GATED_SERVER}/api/__reset`);
  });

  test("an instance nobody has set up shows nothing", async ({ request }) => {
    for (const path of ["/", "/setup", "/setup?token=guess", "/api/settings"]) {
      expect((await request.get(`${GATED_SERVER}${path}`)).status()).toBe(404);
    }
  });

  test("is set up from the setup link, then signs out and in again", async ({
    page,
  }) => {
    await page.goto(`/setup?token=${SETUP_TOKEN}`);
    await page.getByLabel("Your name").fill("Ana");
    await page.getByLabel("Password", { exact: true }).fill("a long password");
    await page.getByLabel("Password again").fill("a long password");
    await page.getByRole("button", { name: "Set up Tashi" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();

    await page.getByRole("navigation").getByText("Settings").click();
    await expect(page.getByText("Ana")).toBeVisible();
    await page.getByRole("button", { name: /Sign out/ }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in to Tashi" }),
    ).toBeVisible();

    await page.getByLabel("Name").fill("ana");
    await page.getByLabel("Password").fill("not the password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByText("That name and password do not match."),
    ).toBeVisible();

    await page.getByLabel("Password").fill("a long password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
  });
});
