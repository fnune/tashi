import { describe, expect, it } from "vitest";
import {
  DATA_SOURCE_LABELS,
  dataSourceOfFoodSource,
  FOOD_SOURCE_IDS,
  foodSourceOfDataSource,
} from "../food-sources.js";

describe("food sources", () => {
  it("maps every source to its label and back", () => {
    for (const id of FOOD_SOURCE_IDS) {
      expect(foodSourceOfDataSource(dataSourceOfFoodSource(id))).toBe(id);
    }
  });

  it("keeps the labels the calculator and the old data use", () => {
    expect(DATA_SOURCE_LABELS).toEqual(
      expect.arrayContaining([
        "sr_legacy_food",
        "survey_fndds_food",
        "foundation_food",
        "curated",
        "USDA FoodData Central",
        "LLM estimate",
        "user",
        "unknown",
      ]),
    );
  });

  it("refuses a label it does not know", () => {
    expect(() => foodSourceOfDataSource("made up")).toThrow();
  });
});
