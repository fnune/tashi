import { expect, test } from "./fixtures.js";
import { atLunchtime, goTo, resetServer } from "./helpers.js";

const MISSING = "Add your Anthropic API key in settings to calculate units.";
const REJECTED =
  "Anthropic rejected the API key. Check it in settings and try again.";

async function saveKey(page: import("@playwright/test").Page, key: string) {
  await page.getByRole("button", { name: /Anthropic API key/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Anthropic API key").fill(key);
  await sheet.getByRole("button", { name: "Save" }).click();
}

test.describe("AI food reading", () => {
  test.beforeEach(async ({ page }) => {
    await atLunchtime(page);
  });

  test("a saved key is shown as saved and calculating works", async ({
    request,
    page,
  }) => {
    await resetServer(request);
    await page.goto("/settings");
    await expect(
      page.getByRole("button", { name: /Anthropic API key/ }),
    ).toContainText("Saved");

    await goTo(page, "Calculate");
    await page.locator("textarea").fill("150g rice");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await expect(page.locator(".dose")).toBeVisible();
  });

  test("without a key, calculating asks for one and leads to the setting", async ({
    request,
    page,
  }) => {
    await resetServer(request, { withKey: false });
    await page.goto("/");
    await page.locator("textarea").fill("150g rice");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await expect(page.getByText(MISSING)).toBeVisible();

    await page.getByRole("link", { name: "Set it up" }).click();
    await expect(page).toHaveURL(/\/settings#api-key/);
    await expect(
      page.getByRole("button", { name: /Anthropic API key/ }),
    ).toContainText("Not set");
  });

  test("a saved key makes calculating work, and removing it takes that away", async ({
    request,
    page,
  }) => {
    await resetServer(request, { withKey: false });
    await page.goto("/settings");
    await saveKey(page, "sk-ant-mine");
    await expect(
      page.getByRole("button", { name: /Anthropic API key/ }),
    ).toContainText("Saved");

    await goTo(page, "Calculate");
    await page.locator("textarea").fill("150g rice");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await expect(page.locator(".dose")).toBeVisible();

    await goTo(page, "Settings");
    await page.getByRole("button", { name: /Anthropic API key/ }).click();
    await page.getByRole("button", { name: "Remove saved key" }).click();
    await expect(
      page.getByRole("button", { name: /Anthropic API key/ }),
    ).toContainText("Not set");
  });

  test("a key the provider rejects is refused and not saved", async ({
    request,
    page,
  }) => {
    await resetServer(request, { withKey: false });
    await page.goto("/settings");
    await saveKey(page, "sk-ant-rejected");
    await expect(page.getByRole("dialog")).toContainText(REJECTED);

    await page.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByRole("button", { name: /Anthropic API key/ }),
    ).toContainText("Not set");
  });

  test("the saved key is never shown again", async ({ request, page }) => {
    await resetServer(request, { withKey: false });
    await page.goto("/settings");
    await saveKey(page, "sk-ant-secret-value");
    await page.getByRole("button", { name: /Anthropic API key/ }).click();
    await expect(page.getByRole("dialog")).not.toContainText("secret-value");
    await expect(
      page.getByRole("dialog").getByLabel("Anthropic API key"),
    ).toHaveValue("");
  });
});
