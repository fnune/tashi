import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

async function logPeriodStart(
  page: Page,
  pick: (sheet: ReturnType<Page["getByRole"]>) => Promise<void>,
) {
  await page.getByRole("button", { name: /First day of last period/ }).click();
  const sheet = page.getByRole("dialog");
  await pick(sheet);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
}

test.describe("full user flow", () => {
  test.beforeEach(async ({ request, page }) => {
    await request.post("/api/__reset");
    const serverLunchtime = new Date();
    serverLunchtime.setHours(13, 0, 0, 0);
    await page.clock.setFixedTime(serverLunchtime);
  });

  test("configure settings, calculate a meal, check history", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("Tashi");

    await page.getByRole("navigation").getByText("Settings").click();
    for (const name of ["morning", "lunch", "dinner"]) {
      await expect(page.getByRole("button", { name })).toBeVisible();
    }

    // Navigate to calculator
    await page.getByRole("navigation").getByText("Calculate").click();

    // Enter a food description
    await page.locator("textarea").fill("150g rice with chicken");

    // Submit the form
    await page.getByRole("button", { name: "Calculate units" }).click();

    // Wait for result
    await expect(page.locator(".dose")).toBeVisible({ timeout: 5000 });

    await expect(page.locator(".food")).toHaveCount(2);
    const calculated = await page.locator(".dose-total b").textContent();
    await page.getByRole("button", { name: "0.5 U more" }).click();
    const injected = String(Number(calculated) + 0.5);
    await page.getByRole("button", { name: `Log ${injected} U` }).click();
    await expect(page.getByText(`meal and ${injected} U`)).toBeVisible();

    await page.getByRole("navigation").getByText("History").click();

    const meals = page.locator('.event[data-entry-type="meal"]');
    await expect(meals).toHaveCount(1);
    await expect(
      page.locator('.event[data-entry-type="fast_insulin"]'),
    ).toContainText(`${injected}`);
    await expect(meals).toContainText("150g rice with chicken");

    await meals.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(dialog.getByRole("alertdialog")).toContainText(
      "can't be undone",
    );
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(meals).toHaveCount(0);
  });

  test("language switch to Spanish", async ({ page }) => {
    await page.goto("/");

    // Go to settings and switch to Spanish
    await page.getByRole("navigation").getByText("Settings").click();
    await page.getByText("Español", { exact: true }).click();

    // After save, UI should switch to Spanish
    await expect(
      page.getByRole("navigation").getByText("Calcular"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation").getByText("Historial"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation").getByText("Ajustes"),
    ).toBeVisible();
  });

  test("changing a food's grams recalculates the dose", async ({ page }) => {
    await page.goto("/");
    await page.locator("textarea").fill("150g rice");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await expect(page.locator(".dose")).toBeVisible({ timeout: 5000 });

    const carbs = async () =>
      Number(
        (await page.locator(".breakdown-total .num").textContent())?.replace(
          /[^\d.]/g,
          "",
        ),
      );
    const before = await carbs();
    await page
      .getByLabel(/^Grams of/)
      .first()
      .fill("300");
    await expect.poll(carbs).toBeCloseTo(before * 2, 0);
    await expect(page.getByRole("button", { name: /^Log/ })).toContainText(
      (await page.locator(".dose-total b").textContent()) ?? "",
    );
  });

  test("reuse a history entry", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("a banana");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await page.getByRole("button", { name: /^Log/ }).click();

    await page.getByRole("navigation").getByText("History").click();
    const meals = page.locator('.event[data-entry-type="meal"]');
    await expect(meals).toHaveCount(1);

    // Expand and reuse
    await meals.click();
    await page.getByRole("button", { name: "Use again" }).click();

    // Should be back on calculator with the text pre-filled
    await expect(page.locator("textarea")).toHaveValue("a banana");
  });

  test("shows estimated badge for unknown foods", async ({ page }) => {
    await page.goto("/");

    await page.locator("textarea").fill("100g something exotic");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await expect(page.locator(".dose")).toBeVisible({ timeout: 5000 });

    await expect(page.locator(".estimated-badge")).toBeVisible();
  });

  test("correction bolus appears when blood sugar is entered", async ({
    page,
  }) => {
    await page.goto("/");

    // Configure a correction factor in settings
    await page.getByRole("navigation").getByText("Settings").click();

    await page.getByRole("button", { name: /Correction factor/ }).click();
    await page.getByLabel("Glucose drop per 1 U").fill("40");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(
      page.getByRole("button", { name: /Correction factor/ }),
    ).toContainText("40 mg/dL");

    // Go to calculator
    await page.getByRole("navigation").getByText("Calculate").click();

    await page.getByRole("button", { name: "Add glucose" }).click();
    await page.getByRole("dialog").getByLabel("Glucose").fill("180");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.locator(".sensor-correction")).toHaveText("+2 U");

    await page.locator("textarea").fill("a banana");
    await page.getByRole("button", { name: "Calculate units" }).click();

    await expect(page.locator(".dose")).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator('.dose-parts [data-part="correction"] dd'),
    ).toHaveText("+2");
  });

  test("meal windows keep the whole day covered while editing", async ({
    page,
  }) => {
    await page.goto("/settings");

    await page.getByRole("button", { name: /lunch/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Ends at").selectOption({ label: "18:00" });
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: /dinner/ })).toContainText(
      "18:00–06:00",
    );

    await page.getByRole("button", { name: /lunch/ }).click();
    await sheet.getByRole("button", { name: "Delete window" }).click();
    await expect(page.getByRole("button", { name: /morning/ })).toContainText(
      "06:00–18:00",
    );
    await expect(page.getByText(/No window covers/)).toHaveCount(0);
  });

  test("sheets close by dragging down or tapping the handle", async ({
    page,
  }) => {
    await page.goto("/settings");
    const sheet = page.getByRole("dialog");

    await page.getByRole("button", { name: /Target blood sugar/ }).click();
    await expect(sheet).toBeVisible();
    const handle = sheet.getByRole("button", { name: "Close" });
    await handle.hover();
    const box = await handle.boundingBox();
    if (!box) throw new Error("handle not rendered");
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 10 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: /Target blood sugar/ }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
  });

  test("log, edit and delete a manual insulin dose", async ({ page }) => {
    await page.goto("/timeline");
    const doses = page.locator('.event[data-entry-type="slow_insulin"]');
    const sheet = page.getByRole("dialog");

    await page.getByRole("button", { name: "Basal insulin" }).click();
    await sheet.getByRole("button", { name: "0.5 U more" }).click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(doses).toContainText("10.5 U");

    await doses.click();
    await sheet.getByRole("button", { name: "0.5 U less" }).click();
    await sheet.getByRole("button", { name: "0.5 U less" }).click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(doses).toContainText("9.5 U");

    await doses.click();
    await sheet.getByRole("button", { name: "Delete" }).click();
    await sheet.getByRole("button", { name: "Cancel" }).click();
    await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
    await sheet.getByRole("button", { name: "Delete" }).click();
    await sheet.getByRole("button", { name: "Delete" }).click();
    await expect(doses).toHaveCount(0);
  });

  test("sheets span the screen and only the backdrop closes them", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/settings");
    const sheet = page.getByRole("dialog");
    await page.getByRole("button", { name: /Target blood sugar/ }).click();
    await expect(sheet).toBeVisible();
    await sheet.evaluate((element) =>
      Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      ),
    );

    const box = await sheet.boundingBox();
    if (!box) throw new Error("sheet not rendered");
    expect(box.width).toBe(1280);

    await page.mouse.click(20, box.y + box.height - 20);
    await expect(sheet).toBeVisible();

    await page.mouse.click(20, box.y - 20);
    await expect(sheet).toBeHidden();
  });

  test("scrolling inside a sheet leaves the page where it was", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto("/settings");
    await page.getByRole("button", { name: "Rapid" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    const pageScroll = await page.evaluate(() => window.scrollY);
    await sheet.hover();
    await page.mouse.wheel(0, 5000);
    await page.mouse.wheel(0, 5000);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);
  });

  test("an active profile scales the dose and is named on it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("textarea").fill("150g rice with chicken");
    await page.getByRole("button", { name: "Calculate units" }).click();
    const normalDose = Number(
      await page.locator(".dose-total b").textContent(),
    );

    await page.getByRole("button", { name: "Change meal" }).click();
    await page.getByText("Sick day").click();
    await expect(page.getByRole("radio", { name: /Sick day/ })).toBeChecked();
    await page.getByRole("button", { name: "Calculate units" }).click();

    await expect(
      page.locator('.dose-parts [data-part="profile"]'),
    ).toContainText("Profile");
    const sickDose = Number(await page.locator(".dose-total b").textContent());
    expect(sickDose).toBeGreaterThan(normalDose);
  });

  test("create a per-window profile and see it override the ratio", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Add profile" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Name").fill("Night shift");
    await sheet.getByText("By time of day").click();
    await sheet.getByLabel("lunch").fill("5");
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toBeHidden();

    await page.getByText("Night shift").click();
    const lunch = page.getByRole("button", { name: /lunch/ });
    await expect(lunch).toContainText("5 g/U");
    await expect(lunch).toContainText("from profile");
    await expect(lunch.locator("s")).toHaveText("10 g/U");

    await page.getByRole("navigation").getByText("Calculate").click();
    await expect(page.locator(".ratio-pill")).toContainText("5 g/U");
  });

  test("a percentage profile shows each window's resulting ratio", async ({
    page,
  }) => {
    await page.goto("/settings");
    const lunch = page.getByRole("button", { name: /lunch/ });
    await expect(lunch).toHaveText(/10\sg\/U/);
    await expect(lunch).not.toContainText("%");

    await page.getByText("Sick day").click();
    await expect(lunch).toContainText("8.33 g/U");
    await expect(lunch).toContainText("10 g/U · +20 %");

    const chip = page.locator(".ratio-pill");
    await expect(chip).toHaveText(/lunch\s*10 →\s*8\.33\sg\/U/);
    await page.getByRole("navigation").getByText("Calculate").click();
    await chip.click();
    await expect(page).toHaveURL(/\/settings#ratios$/);
    await expect(page.locator("#ratios")).toBeInViewport();
  });

  test("cycle tracking shows the phase and suggests a profile on day 1", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("switch", { name: "Track my cycle" }).check();
    await logPeriodStart(page, (sheet) => sheet.getByText("Today").click());
    await expect(page.getByText("Day 1 of 28")).toBeVisible();
    await expect(page.locator(".cycle-phase")).toHaveText("Period");
    await page.getByText("Cycle chart").click();
    await expect(page.locator(".cycle-phases li[data-current]")).toContainText(
      "You are here · day 1",
    );

    await page.getByRole("navigation").getByText("Calculate").click();
    await expect(page.locator(".cycle-banner")).toContainText(
      "Day 1 of 28 · Period",
    );
    await expect(page.locator(".cycle-banner .cycle-strips")).toBeVisible();
    await page.getByRole("button", { name: "Switch profile?" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText("Your period has started");
    await sheet.getByText("Menstruation").click();
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole("radio", { name: /Menstruation/ }),
    ).toBeChecked();
  });

  test("cycle tracking never changes the dose", async ({ page }) => {
    await page.goto("/");
    await page.locator("textarea").fill("a banana");
    await page.getByRole("button", { name: "Calculate units" }).click();
    const before = await page.locator(".dose-total b").textContent();

    await page.goto("/settings");
    await page.getByRole("switch", { name: "Track my cycle" }).check();
    await logPeriodStart(page, (sheet) => sheet.getByText("Today").click());

    await page.getByRole("navigation").getByText("Calculate").click();
    await page.getByRole("button", { name: "Change meal" }).click();
    await page.locator("textarea").fill("a banana");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await expect(page.locator(".dose-total b")).toHaveText(before ?? "");
  });

  test("the dose card explains how the dose is worked out", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator("textarea").fill("a banana");
    await page.getByRole("button", { name: "Calculate units" }).click();
    await page.getByRole("link", { name: "Why?" }).click();
    await expect(
      page.getByRole("heading", {
        name: "How your insulin units are worked out",
      }),
    ).toBeVisible();
    await expect(page.locator("#profiles")).toContainText("−20 %");
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.locator(".dose")).toBeVisible();
  });

  test("asks whether the period has started around the predicted date", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("switch", { name: "Track my cycle" }).check();
    const serverToday = new Date();
    serverToday.setHours(13, 0, 0, 0);
    const start = new Date(serverToday);
    start.setDate(start.getDate() - 26);
    const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    await logPeriodStart(page, (sheet) =>
      sheet.getByLabel("First day of last period").last().fill(iso),
    );

    await page.getByRole("navigation").getByText("Calculate").click();
    const banner = page.locator(".cycle-banner");
    await expect(banner).toContainText("Day 27 of 28");
    await expect(banner).toContainText("Has your period started?");
    await page.getByRole("button", { name: "Yes, today" }).click();
    await expect(banner).toContainText("Day 1 of 28 · Period");
    await expect(
      page.getByRole("button", { name: "Switch profile?" }),
    ).toBeVisible();
  });

  test("ratios can be shown and edited as units per 10 g", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("U/10 g", { exact: true }).click();
    await expect(page.getByRole("button", { name: /morning/ })).toContainText(
      "1.25 U/10 g",
    );
    const sheet = page.getByRole("dialog");

    await page.getByRole("button", { name: /lunch/ }).click();
    await sheet.getByLabel("Units per 10 g of carbs").fill("2");
    await sheet.getByRole("button", { name: "Save" }).click();

    await page.getByRole("button", { name: /dinner/ }).click();
    await expect(sheet.getByLabel("Units per 10 g of carbs")).toHaveValue(
      "0.83",
    );
    await sheet.getByLabel("Name").fill("supper");
    await sheet.getByRole("button", { name: "Save" }).click();

    await page.getByText("g/U", { exact: true }).click();
    await expect(page.getByRole("button", { name: /lunch/ })).toContainText(
      "5 g/U",
    );
    await expect(page.getByRole("button", { name: /supper/ })).toContainText(
      "12 g/U",
    );
  });

  test("the tab bar stays on screen however many profiles there are", async ({
    page,
    request,
  }) => {
    const settings = await (await request.get("/api/settings")).json();
    const extra = ["Night shift", "Long-haul flight", "Exam week"].map(
      (name, i) => ({
        id: `extra-${i}`,
        name,
        emoji: "⭐",
        adjustment: { mode: "percent", percent: 10 },
      }),
    );
    await request.put("/api/settings", {
      data: { ...settings, profiles: [...settings.profiles, ...extra] },
    });

    for (const path of ["/", "/timeline", "/settings"]) {
      await page.goto(path);
      await expect(page.locator(".tab-bar")).toBeVisible();
      const layout = await page.evaluate(() => ({
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        barBottom: document.querySelector(".tab-bar")?.getBoundingClientRect()
          .bottom,
        viewportBottom: window.innerHeight,
      }));
      expect(layout.overflow, path).toBe(0);
      expect(layout.barBottom, path).toBe(layout.viewportBottom);
    }
  });

  test("tapping the cycle strip opens the expanded cycle chart", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByRole("switch", { name: "Track my cycle" }).check();
    await logPeriodStart(page, (sheet) => sheet.getByText("Yesterday").click());

    await page.getByRole("navigation").getByText("Calculate").click();
    await page.locator("a.cycle-banner").click();
    await expect(page.locator("#cycle-chart")).toHaveJSProperty("open", true);
    await expect(
      page.locator(".cycle-phases li[data-current]"),
    ).toBeInViewport();
  });

  test("profiles are edited and deleted from their chip", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "Edit Normal" })).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Edit Sport" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "5 % more" }).click();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(
      page.locator(".profile-chip", { hasText: "Sport" }),
    ).toContainText("−15 %");

    await page.getByRole("button", { name: "Edit Sport" }).click();
    await sheet.getByRole("button", { name: "Delete profile" }).click();
    await expect(
      page.locator(".profile-chip", { hasText: "Sport" }),
    ).toHaveCount(0);
  });
});
