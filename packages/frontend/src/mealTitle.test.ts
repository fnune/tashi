import type { CalculatedItem } from "@tashi/shared";
import { describe, expect, it } from "vitest";
import { mealTitle } from "./mealTitle.js";

const meal_window = { name: "lunch", start_hour: 12, end_hour: 16, ratio: 5 };
const items = [
  { description: "White rice (cooked)" },
  { description: "Chicken breast (grilled)" },
] as CalculatedItem[];

describe("mealTitle", () => {
  it("is what the person wrote", () => {
    expect(
      mealTitle({ input_text: "150g rice with chicken", items, meal_window }),
    ).toBe("150g rice with chicken");
  });

  it("puts a multi-line description on one line", () => {
    expect(
      mealTitle({
        input_text: "  150g rice\n\n  120g chicken ",
        items,
        meal_window,
      }),
    ).toBe("150g rice 120g chicken");
  });

  it("falls back to the recognised foods", () => {
    expect(mealTitle({ input_text: " ", items, meal_window })).toBe(
      "White rice (cooked), Chicken breast (grilled)",
    );
  });

  it("falls back to the meal window when there is nothing else", () => {
    expect(mealTitle({ input_text: "", items: [], meal_window })).toBe("lunch");
  });
});
