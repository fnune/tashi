import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Settings } from "@pincho/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Calculator } from "../calculator.js";
import type { FoodDatabase } from "../db/food-db.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { createTestFoodDb } from "./test-food-db.js";

const TEST_SETTINGS: Settings = {
  meal_windows: [
    { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
    { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    { name: "dinner", start_hour: 16, end_hour: 23, ratio: 12 },
  ],
  correction_factor: 40,
  target_blood_sugar: 100,
  glucose_unit: "mg/dL",
  pen_increment: 0.5,
  language: "en",
};

describe("Calculator", () => {
  let parser: FakeFoodParser;
  let calculator: Calculator;
  let foodDb: FoodDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pincho-calc-test-"));
    parser = new FakeFoodParser();
    foodDb = await createTestFoodDb(tmpDir);
    calculator = new Calculator(parser, foodDb);
  });

  afterEach(async () => {
    foodDb.close();
    await rm(tmpDir, { recursive: true });
  });

  it("calculates carbs and dose from DB match", async () => {
    parser.setResponse("150g white rice, grilled chicken breast", [
      {
        description: "White rice (cooked)",
        fdc_id: 169756,
        weight_g: 150,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 28,
        estimated_glycemic_index: 73,
        warning: null,
      },
      {
        description: "Chicken breast (grilled)",
        fdc_id: 171534,
        weight_g: 170,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 0,
        estimated_glycemic_index: null,
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
    expect(rice.food_item).not.toBeNull();
    expect(rice.food_item!.fdc_id).toBe(169756);
    expect(rice.estimated).toBe(false);

    const chicken = result.items[1]!;
    expect(chicken.net_carbs_g).toBe(0);

    expect(result.total_net_carbs_g).toBeCloseTo(41.7, 0);
    expect(result.recommended_dose).toBe(4);

    expect(result.trace).toBeDefined();
    expect(result.trace!.model).toBe("fake");
    expect(result.trace!.searches).toEqual([]);
    expect(result.trace!.raw_response).toContain("White rice");
  });

  it("uses LLM estimate when fdc_id is null (no DB match)", async () => {
    parser.setResponse("100g acai bowl", [
      {
        description: "Acai bowl",
        fdc_id: null,
        weight_g: 100,
        assumed_cooked: false,
        confidence: "low",
        notes: "Not in database",
        estimated_net_carbs_per_100g: 15.0,
        estimated_glycemic_index: 35,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "100g acai bowl",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const item = result.items[0]!;
    expect(item.net_carbs_g).toBe(15.0);
    expect(item.estimated).toBe(true);
    expect(item.data_source).toBe("LLM estimate");
    expect(item.food_item).toBeNull();
  });

  it("uses LLM estimate when fdc_id doesn't exist in DB", async () => {
    parser.setResponse("100g mystery food", [
      {
        description: "Mystery food",
        fdc_id: 999999999,
        weight_g: 100,
        assumed_cooked: false,
        confidence: "low",
        notes: null,
        estimated_net_carbs_per_100g: 20.0,
        estimated_glycemic_index: 50,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "100g mystery food",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const item = result.items[0]!;
    expect(item.net_carbs_g).toBe(20.0);
    expect(item.estimated).toBe(true);
    expect(item.data_source).toBe("LLM estimate");
  });

  it("applies correction bolus when blood sugar is above target", async () => {
    parser.setResponse("a banana", [
      {
        description: "Banana",
        fdc_id: 173944,
        weight_g: 120,
        assumed_cooked: false,
        confidence: "medium",
        notes: "Assumed medium banana (~120g)",
        estimated_net_carbs_per_100g: 20,
        estimated_glycemic_index: 51,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "a banana",
      TEST_SETTINGS,
      180,
      "morning",
    );

    expect(result.correction).toBeDefined();
    expect(result.correction!.current_blood_sugar).toBe(180);
    expect(result.correction!.correction_dose).toBeGreaterThan(0);
    expect(result.correction!.total_dose).toBeGreaterThan(
      result.recommended_dose,
    );
  });

  it("reduces dose when blood sugar is below target (hypo)", async () => {
    parser.setResponse("a banana", [
      {
        description: "Banana",
        fdc_id: 173944,
        weight_g: 120,
        assumed_cooked: false,
        confidence: "medium",
        notes: null,
        estimated_net_carbs_per_100g: 20,
        estimated_glycemic_index: 51,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "a banana",
      TEST_SETTINGS,
      45,
      "morning",
    );

    expect(result.correction).toBeDefined();
    expect(result.correction!.correction_dose).toBeLessThan(0);
    expect(result.correction!.total_dose).toBeLessThan(result.recommended_dose);
    expect(result.correction!.total_dose).toBeGreaterThanOrEqual(0);
  });

  it("uses DB glycemic index over LLM estimate", async () => {
    parser.setResponse("150g rice and 100g acai bowl", [
      {
        description: "White rice (cooked)",
        fdc_id: 169756,
        weight_g: 150,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 28,
        estimated_glycemic_index: 70,
        warning: null,
      },
      {
        description: "Acai bowl",
        fdc_id: null,
        weight_g: 100,
        assumed_cooked: false,
        confidence: "low",
        notes: null,
        estimated_net_carbs_per_100g: 15.0,
        estimated_glycemic_index: 35,
        warning: null,
      },
    ]);

    const result = await calculator.calculate(
      "150g rice and 100g acai bowl",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const rice = result.items[0]!;
    expect(rice.glycemic_index).toBe(73);
    expect(rice.gi_estimated).toBe(false);

    const acai = result.items[1]!;
    expect(acai.glycemic_index).toBe(35);
    expect(acai.gi_estimated).toBe(true);
  });

  it("passes through warnings from the LLM", async () => {
    parser.setResponse("500g of sugar in my coffee", [
      {
        description: "Sugar",
        fdc_id: 169655,
        weight_g: 500,
        assumed_cooked: false,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 100,
        estimated_glycemic_index: 65,
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
        fdc_id: 169756,
        weight_g: 200,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 28,
        estimated_glycemic_index: 73,
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

describe("FoodDatabase search", () => {
  let foodDb: FoodDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pincho-search-test-"));
    foodDb = await createTestFoodDb(tmpDir);
  });

  afterEach(async () => {
    foodDb.close();
    await rm(tmpDir, { recursive: true });
  });

  it("finds foods by matching words", () => {
    const results = foodDb.search("rice white cooked");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.fdc_id).toBe(169756);
  });

  it("matches partial word sets (not all words required)", () => {
    const results = foodDb.search("banana");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.description).toContain("Banana");
  });

  it("ranks results by number of matching words", () => {
    const results = foodDb.search("chicken breast grilled cooked");
    expect(results.length).toBeGreaterThan(0);
    // Chicken should rank higher than rice (more word matches)
    expect(results[0]!.fdc_id).toBe(171534);
  });

  it("returns empty array for no matches", () => {
    const results = foodDb.search("xyznonexistent");
    expect(results).toHaveLength(0);
  });

  it("stems words with porter tokenizer", () => {
    const results = foodDb.search("cooking");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.fdc_id).toBe(169756);
  });
});
