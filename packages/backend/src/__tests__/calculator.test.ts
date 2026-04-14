import type { Settings } from "@t1d-aid/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { Calculator } from "../calculator.js";
import { FakeFoodParser } from "./fake-food-parser.js";

const TEST_SETTINGS: Settings = {
  meal_windows: [
    { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
    { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    { name: "dinner", start_hour: 16, end_hour: 23, ratio: 12 },
  ],
  correction_factor: 2.2,
  target_blood_sugar: 6.0,
  pen_increment: 0.5,
  language: "en",
};

describe("Calculator", () => {
  let parser: FakeFoodParser;
  let calculator: Calculator;

  beforeEach(() => {
    parser = new FakeFoodParser();
    calculator = new Calculator(parser);
  });

  it("calculates carbs and dose for a simple meal", async () => {
    parser.setResponse("150g white rice, grilled chicken breast", [
      {
        description: "White rice (cooked)",
        weight_g: 150,
        db_key: "rice_white_cooked",
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: null,
        warning: null,
      },
      {
        description: "Chicken breast (grilled)",
        weight_g: 170,
        db_key: "chicken_breast_grilled",
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "150g white rice, grilled chicken breast",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    expect(result.items).toHaveLength(2);

    const rice = result.items[0]!;
    expect(rice.net_carbs_g).toBeCloseTo(41.7, 0);
    expect(rice.data_source).toBe("USDA FoodData Central");
    expect(rice.estimated).toBe(false);

    const chicken = result.items[1]!;
    expect(chicken.net_carbs_g).toBe(0);

    expect(result.total_net_carbs_g).toBeCloseTo(41.7, 0);
    expect(result.recommended_dose).toBe(4);
    expect(result.meal_window.name).toBe("lunch");
  });

  it("applies correction bolus when blood sugar is above target", async () => {
    parser.setResponse("a banana", [
      {
        description: "Banana",
        weight_g: 120,
        db_key: "banana",
        assumed_cooked: false,
        confidence: "medium",
        notes: "Assumed medium banana (~120g)",
        estimated_net_carbs_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "a banana",
      TEST_SETTINGS,
      10.0,
      "morning",
    );

    expect(result.correction).toBeDefined();
    expect(result.correction!.current_blood_sugar).toBe(10.0);
    expect(result.correction!.correction_dose).toBeGreaterThan(0);
    expect(result.correction!.total_dose).toBeGreaterThan(
      result.recommended_dose,
    );
  });

  it("uses LLM estimate when food is not in database", async () => {
    parser.setResponse("100g acai bowl", [
      {
        description: "Acai bowl",
        weight_g: 100,
        db_key: null,
        assumed_cooked: false,
        confidence: "low",
        notes: "Not in database, using estimate",
        estimated_net_carbs_per_100g: 15.0,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "100g acai bowl",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    expect(result.items[0]!.net_carbs_g).toBe(15.0);
    expect(result.items[0]!.estimated).toBe(true);
    expect(result.items[0]!.data_source).toBe("LLM estimate");
  });

  it("passes through warnings from the LLM", async () => {
    parser.setResponse("500g of sugar in my coffee", [
      {
        description: "Sugar",
        weight_g: 500,
        db_key: "sugar_white",
        assumed_cooked: false,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: null,
        warning: "500g of sugar is an unusually large amount for coffee",
      },
    ]);

    const result = await calculator.calculate(
      "500g of sugar in my coffee",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    expect(result.items[0]!.warning).toBe(
      "500g of sugar is an unusually large amount for coffee",
    );
  });

  it("rounds dose to pen increment", async () => {
    parser.setResponse("200g cooked rice", [
      {
        description: "White rice (cooked)",
        weight_g: 200,
        db_key: "rice_white_cooked",
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: null,
        warning: null,
      },
    ]);

    const halfUnitSettings = { ...TEST_SETTINGS, pen_increment: 0.5 as const };
    const result05 = await calculator.calculate(
      "200g cooked rice",
      halfUnitSettings,
      undefined,
      "lunch",
    );

    const wholeUnitSettings = { ...TEST_SETTINGS, pen_increment: 1 as const };
    const result1 = await calculator.calculate(
      "200g cooked rice",
      wholeUnitSettings,
      undefined,
      "lunch",
    );

    expect(result05.recommended_dose % 0.5).toBe(0);
    expect(result1.recommended_dose % 1).toBe(0);
  });
});
