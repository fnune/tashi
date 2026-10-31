import { expect, test } from "@playwright/test";
import { GATED_SERVER } from "./helpers.js";

const SETUP_TOKEN = "e2e-setup-token";
const PASSWORD = "violet tractor misty pancake";

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
    await expect(page).toHaveURL(/\/setup$/);
    await page.getByLabel("Your name").fill("Ana");
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Password again").fill(PASSWORD);
    await page.getByRole("button", { name: "Set up Tashi" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page).not.toHaveURL(/setup/);

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

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("asks for a strong password before setting up", async ({ page }) => {
    await page.goto(`/setup?token=${SETUP_TOKEN}`);
    await page.getByLabel("Your name").fill("Ana");
    const submit = page.getByRole("button", { name: "Set up Tashi" });

    await page.getByLabel("Password", { exact: true }).fill("password1234");
    await page.getByLabel("Password again").fill("password1234");
    await expect(page.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      /weak/i,
    );
    await expect(submit).toBeDisabled();

    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await expect(
      page.getByText("The two passwords are different."),
    ).toBeVisible();
    await page.getByLabel("Password again").fill(PASSWORD);
    await expect(page.getByRole("meter")).toHaveAttribute(
      "aria-valuetext",
      /strong/i,
    );
    await expect(submit).toBeEnabled();
  });
});
