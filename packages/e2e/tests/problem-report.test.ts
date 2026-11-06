import { expect, test } from "./fixtures.js";
import { goTo, resetServer } from "./helpers.js";

test.describe("reporting a problem", () => {
  test("lists what the server and the browser recorded, ready for GitHub", async ({
    page,
    request,
  }) => {
    await resetServer(request);
    await page.goto("/");
    await goTo(page, "Settings");
    await page.getByRole("button", { name: /Report a problem/ }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Problems the server recorded")).toBeVisible();
    await expect(sheet.locator("pre")).toHaveText(
      /server recorded\s+None recorded\.[\s\S]*this browser\s+None recorded\./,
    );
    await expect(
      sheet.getByRole("link", { name: "Open on GitHub" }),
    ).toHaveAttribute(
      "href",
      /^https:\/\/github\.com\/fnune\/tashi\/issues\/new\?/,
    );
  });

  test("says the server has not answered instead of showing a blank screen", async ({
    page,
    request,
  }) => {
    await resetServer(request);
    await page.clock.install();
    await page.route("**/api/auth/me", () => {});
    await page.goto("/");
    await page.clock.fastForward(16_000);

    await expect(
      page.getByRole("heading", { name: "Tashi is not answering" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Report a problem" }).click();
    await expect(
      page.getByRole("dialog").getByText(/no_answer GET \/api\/auth\/me/),
    ).toBeVisible();
  });
});

test.describe("reporting a problem while signed out", () => {
  test.use({ server: "gated" });

  test("leaves out the server's list, which needs a signed-in admin", async ({
    page,
    request,
  }) => {
    await request.post("/api/__reset");
    await page.goto("/setup?token=e2e-setup-token");
    await page.getByLabel("Your name").fill("Ana");
    await page
      .getByLabel("Password", { exact: true })
      .fill("violet tractor misty pancake");
    await page
      .getByLabel("Password again")
      .fill("violet tractor misty pancake");
    await page.getByRole("button", { name: "Set up Tashi" }).click();
    await goTo(page, "Settings");
    await page.getByRole("button", { name: /Sign out/ }).click();

    await page.getByRole("button", { name: "Report a problem" }).click();
    const sheet = page.getByRole("dialog");
    await expect(
      sheet.getByText(/Only an admin who is signed in/),
    ).toBeVisible();
    await expect(sheet.getByText(/Not available:/)).toBeVisible();
  });
});
