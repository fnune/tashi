import { describe, expect, it } from "vitest";
import { fromDisplayRatio, toDisplayRatio } from "../ratio-format.js";

describe("ratio format", () => {
  it("shows grams per unit unchanged", () => {
    expect(toDisplayRatio(6.66, "grams_per_unit")).toBe(6.66);
    expect(fromDisplayRatio(6.66, "grams_per_unit")).toBe(6.66);
  });

  it("converts grams per unit to units per 10 g of carbs", () => {
    expect(toDisplayRatio(5, "units_per_10g")).toBe(2);
    expect(toDisplayRatio(6.66, "units_per_10g")).toBeCloseTo(1.5015, 4);
  });

  it("converts units per 10 g back to grams per unit", () => {
    expect(fromDisplayRatio(1.5, "units_per_10g")).toBeCloseTo(6.6667, 4);
  });

  it("round-trips without drift", () => {
    for (const ratio of [4, 5.12, 6.66, 10, 12.5]) {
      expect(
        fromDisplayRatio(
          toDisplayRatio(ratio, "units_per_10g"),
          "units_per_10g",
        ),
      ).toBeCloseTo(ratio, 10);
    }
  });
});
