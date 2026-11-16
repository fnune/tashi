import { expect, test } from "./fixtures.js";
import { atLunchtime, resetServer } from "./helpers.js";

test("logging a meal teaches Tashi the foods in it, and only then", async ({
  request,
  page,
}) => {
  await resetServer(request);
  await atLunchtime(page);
  await page.goto("/");

  await page.locator("textarea").fill("150g rice with chicken");
  await page.getByRole("button", { name: "Calculate units" }).click();
  await expect(page.locator(".dose")).toBeVisible();
  expect(await (await request.get(`/api/__vocabulary`)).json()).toEqual([]);

  await page.getByRole("button", { name: /^Log / }).click();
  await expect(page.getByText(/Logged in history/)).toBeVisible();

  const learned = (await (await request.get(`/api/__vocabulary`)).json()) as {
    description: string;
    use_count: number;
  }[];
  expect(learned.length).toBeGreaterThan(0);
  expect(learned.every((food) => food.use_count === 1)).toBe(true);
});
