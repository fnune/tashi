import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";
import { atLunchtime, goTo, resetServer } from "./helpers.js";

async function expectSaved(page: Page, act: () => Promise<void>) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/settings") && r.request().method() === "PUT",
  );
  await act();
  expect((await response).status()).toBe(200);
}

function sheet(page: Page) {
  return page.getByRole("dialog");
}

async function saveSheet(page: Page) {
  await expectSaved(page, () =>
    sheet(page).getByRole("button", { name: "Save" }).click(),
  );
}

function visibleChoice(
  scope: Page | Locator,
  group: string,
  text: string | RegExp,
) {
  return scope
    .getByRole("group", { name: group })
    .locator("label, .profile-chip")
    .filter({ hasText: text })
    .last();
}

function profileChip(page: Page, group: string, name: string) {
  return page
    .getByRole("group", { name: group })
    .locator(".profile-chip")
    .filter({ hasText: name });
}

function look(option: Locator) {
  return option.evaluate((el) => {
    const style = getComputedStyle(el);
    return `${style.backgroundColor}|${style.color}`;
  });
}

async function expectShownSelected(option: Locator, unselectedLook?: string) {
  await expect(option).toBeVisible();
  await expect
    .poll(() =>
      option.evaluate((el, unselected) => {
        const lookOf = (e: Element) => {
          const style = getComputedStyle(e);
          return `${style.backgroundColor}|${style.color}`;
        };
        const peers = [...(el.parentElement?.children ?? [])].filter(
          (peer) => peer !== el && peer.tagName === el.tagName,
        );
        const others = [
          ...peers.map(lookOf),
          ...(unselected ? [unselected] : []),
        ];
        return others.length > 0 && others.every((o) => o !== lookOf(el));
      }, unselectedLook),
    )
    .toBe(true);
}

function pick(page: Page, group: string, text: string | RegExp) {
  return expectSaved(page, () => visibleChoice(page, group, text).click());
}

const windowButtons = (page: Page) =>
  page.getByRole("button", { name: /^(morning|lunch|dinner|brunch|snack)/ });

for (const start of ["fresh install", "seeded settings"] as const) {
  test.describe(`settings writes from ${start}`, () => {
    test.beforeEach(async ({ request, page }) => {
      await resetServer(request, { fresh: start === "fresh install" });
      await atLunchtime(page);
      await page.goto("/settings");
    });

    test("target blood sugar", async ({ page }) => {
      await page.getByRole("button", { name: /Target blood sugar/ }).click();
      await sheet(page).getByLabel("Target blood sugar").fill("110");
      await saveSheet(page);

      await page.reload();
      await expect(
        page.getByRole("button", { name: /Target blood sugar/ }),
      ).toContainText("110 mg/dL");
    });

    test("clearing the correction factor", async ({ page }) => {
      const row = page.getByRole("button", { name: /Correction factor/ });
      await row.click();
      await sheet(page).getByLabel("Glucose drop per 1 U").fill("40");
      await saveSheet(page);
      await row.click();
      await sheet(page).getByLabel("Glucose drop per 1 U").fill("");
      await saveSheet(page);

      await page.reload();
      await expect(row).toContainText("Not set");
    });

    test("fat/protein multiplier", async ({ page }) => {
      const row = page.getByRole("button", {
        name: /Fat\/protein multiplier/,
      });
      await row.click();
      await sheet(page)
        .getByLabel("Extra insulin % for high-fat/protein meals")
        .fill("35");
      await saveSheet(page);

      await page.reload();
      await expect(row).toContainText("+35 %");
    });

    test("pen increment", async ({ page }) => {
      await expectShownSelected(visibleChoice(page, "Pen increment", "0.5 U"));
      await pick(page, "Pen increment", "1 U");

      await page.reload();
      await expectShownSelected(visibleChoice(page, "Pen increment", "1 U"));
    });

    test("bolus insulin and its duration of action", async ({ page }) => {
      await page.getByRole("button", { name: /^Basal/ }).click();
      const unselected = await look(
        visibleChoice(sheet(page), "Basal (long-acting) insulin", "Levemir"),
      );
      await page.keyboard.press("Escape");
      const row = page.getByRole("button", { name: /^Rapid/ });
      await row.click();
      await visibleChoice(
        sheet(page),
        "Bolus (fast-acting) insulin",
        "NovoRapid",
      ).click();
      await sheet(page)
        .getByLabel("Duration of insulin action (DIA)")
        .fill("240");
      await saveSheet(page);

      await page.reload();
      await expect(row).toContainText("NovoRapid");
      await row.click();
      await expectShownSelected(
        visibleChoice(sheet(page), "Bolus (fast-acting) insulin", "NovoRapid"),
        unselected,
      );
      await expect(
        sheet(page).getByLabel("Duration of insulin action (DIA)"),
      ).toHaveValue("240");
    });

    test("basal insulin", async ({ page }) => {
      const row = page.getByRole("button", { name: /^Basal/ });
      await row.click();
      await visibleChoice(
        sheet(page),
        "Basal (long-acting) insulin",
        "Tresiba",
      ).click();
      await saveSheet(page);

      await page.reload();
      await expect(row).toContainText("Tresiba");
      await row.click();
      await expectShownSelected(
        visibleChoice(sheet(page), "Basal (long-acting) insulin", "Tresiba"),
      );
    });

    test("active profile picked in settings", async ({ page }) => {
      await expectShownSelected(profileChip(page, "Active profile", "Normal"));
      await expectSaved(page, () =>
        profileChip(page, "Active profile", "Sport").getByText("Sport").click(),
      );

      await page.reload();
      await expectShownSelected(profileChip(page, "Active profile", "Sport"));
    });

    test("active profile picked on the calculator", async ({ page }) => {
      await goTo(page, "Calculate");
      await expectSaved(page, () =>
        profileChip(page, "Ratio profiles", "Sport").getByText("Sport").click(),
      );

      await page.reload();
      await expectShownSelected(profileChip(page, "Ratio profiles", "Sport"));
    });

    test("editing a built-in profile", async ({ page }) => {
      const chip = profileChip(page, "Active profile", "Sport");
      await expect(chip).toContainText("−20 %");
      await page.getByRole("button", { name: "Edit Sport" }).click();
      await sheet(page)
        .getByRole("button", { name: /% less/ })
        .click();
      await saveSheet(page);

      await page.reload();
      await expect(chip).toBeVisible();
      await expect(chip).not.toContainText("−20 %");
    });

    test("picking a profile icon", async ({ page }) => {
      await page.getByRole("button", { name: "Edit Sport" }).click();
      const icons = sheet(page).locator(".icon-picker label");
      const current = await icons.evaluateAll((labels) =>
        labels.findIndex((l) => l.querySelector("input")?.checked),
      );
      const other = current === 0 ? 1 : 0;
      await icons.nth(other).click();
      await saveSheet(page);

      await page.reload();
      await page.getByRole("button", { name: "Edit Sport" }).click();
      await expectShownSelected(
        sheet(page).locator(".icon-picker label").nth(other),
      );
    });

    test("deleting the active profile falls back to Normal", async ({
      page,
    }) => {
      await expectSaved(page, () =>
        profileChip(page, "Active profile", "Sick day")
          .getByText("Sick day")
          .click(),
      );
      await page.getByRole("button", { name: "Edit Sick day" }).click();
      await expectSaved(page, () =>
        sheet(page).getByRole("button", { name: "Delete profile" }).click(),
      );

      await page.reload();
      await expect(profileChip(page, "Active profile", "Sick day")).toHaveCount(
        0,
      );
      await expectShownSelected(profileChip(page, "Active profile", "Normal"));
    });

    test("renaming a window and changing its ratio", async ({ page }) => {
      await page.getByRole("button", { name: /^lunch/ }).click();
      await sheet(page).getByLabel("Name").fill("brunch");
      await sheet(page).getByLabel("Grams of carbs covered by 1 U").fill("9");
      await saveSheet(page);

      await page.reload();
      await expect(page.getByRole("button", { name: /^brunch/ })).toContainText(
        "9 g/U",
      );
      await expect(page.getByRole("button", { name: /^lunch/ })).toHaveCount(0);
    });

    test("adding and deleting windows", async ({ page }) => {
      await page.getByRole("button", { name: "Add window" }).click();
      await sheet(page).getByLabel("Name").fill("snack");
      await saveSheet(page);
      await page.reload();
      await expect(page.getByRole("button", { name: /^snack/ })).toHaveCount(1);
      await expect(windowButtons(page)).toHaveCount(4);

      await page.getByRole("button", { name: /^dinner/ }).click();
      await expectSaved(page, () =>
        sheet(page).getByRole("button", { name: "Delete window" }).click(),
      );
      await page.reload();
      await expect(page.getByRole("button", { name: /^dinner/ })).toHaveCount(
        0,
      );
      await expect(windowButtons(page)).toHaveCount(3);
    });

    test("glucose unit", async ({ page }) => {
      await expectShownSelected(visibleChoice(page, "Glucose unit", "mg/dL"));
      await pick(page, "Glucose unit", "mmol/L");

      await page.reload();
      await expectShownSelected(visibleChoice(page, "Glucose unit", "mmol/L"));
      await expect(
        page.getByRole("button", { name: /Target blood sugar/ }),
      ).toContainText("mmol/L");
    });

    test("ratio format", async ({ page }) => {
      await expect(page.getByRole("button", { name: /^lunch/ })).toContainText(
        "g/U",
      );
      await pick(page, "Ratio format", /10 g/);

      await page.reload();
      await expectShownSelected(visibleChoice(page, "Ratio format", /10 g/));
      await expect(
        page.getByRole("button", { name: /^lunch/ }),
      ).not.toContainText("g/U");
    });

    test("language", async ({ page }) => {
      await pick(page, "Language", "Español");

      await page.reload();
      await expectShownSelected(visibleChoice(page, "Idioma", "Español"));
    });

    test("cycle tracking, last period and cycle length", async ({ page }) => {
      await expectSaved(page, () =>
        page.getByRole("switch", { name: "Track my cycle" }).click(),
      );
      await page
        .getByRole("button", { name: /First day of last period/ })
        .click();
      await visibleChoice(
        sheet(page),
        "First day of last period",
        "Yesterday",
      ).click();
      await saveSheet(page);
      await page.getByRole("button", { name: /Average cycle length/ }).click();
      await sheet(page).getByRole("button", { name: "+1" }).click();
      await saveSheet(page);

      await page.reload();
      await expect(
        page.getByRole("switch", { name: "Track my cycle" }),
      ).toBeChecked();
      await expect(
        page.getByRole("button", { name: /First day of last period/ }),
      ).not.toContainText("Not set");
      await expect(
        page.getByRole("button", { name: /Average cycle length/ }),
      ).toContainText("29 days");
    });
  });
}

test("the theme is kept on this device", async ({ request, page }) => {
  await resetServer(request);
  await page.goto("/settings");
  await visibleChoice(page, "Theme", "Dark").click();

  await page.reload();
  await expectShownSelected(visibleChoice(page, "Theme", "Dark"));
});
