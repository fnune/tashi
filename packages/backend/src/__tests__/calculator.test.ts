import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CalculationResult, Settings } from "@pincho/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Calculator } from "../calculator.js";
import type { FoodDatabase } from "../db/food-db.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { createTestFoodDb } from "./test-food-db.js";

async function calculateOk(
  calculator: Calculator,
  ...args: Parameters<Calculator["calculate"]>
): Promise<CalculationResult> {
  const outcome = await calculator.calculate(...args);
  if (outcome.status !== "ok") {
    throw new Error(
      `expected ok outcome, got ${outcome.status}: ${outcome.message}`,
    );
  }
  return outcome.result;
}

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
  fat_protein_multiplier: 0.2,
  bolus_insulin_id: "novorapid",
  basal_insulin_id: "tresiba",
  insulin_action_minutes: 300,
  language: "en",
  profiles: [],
  active_profile_id: "normal",
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
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
        user_carbs: null,
        estimated_glycemic_index: null,
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
        warning: "500g of sugar is an unusually large amount for coffee",
      },
    ]);

    const result = await calculateOk(
      calculator,
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
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        user_carbs: null,
        warning: null,
      },
    ]);

    const halfUnitSettings = { ...TEST_SETTINGS, pen_increment: 0.5 as const };
    const result05 = await calculateOk(
      calculator,
      "200g cooked rice",
      halfUnitSettings,
      undefined,
      "lunch",
    );

    const wholeUnitSettings = { ...TEST_SETTINGS, pen_increment: 1 as const };
    const result1 = await calculateOk(
      calculator,
      "200g cooked rice",
      wholeUnitSettings,
      undefined,
      "lunch",
    );

    expect(result05.recommended_dose % 0.5).toBe(0);
    expect(result1.recommended_dose % 1).toBe(0);
  });

  it("prefers user-provided carbs (per_100g) over USDA", async () => {
    parser.setResponse("150g rice, 14g carbs per 100g", [
      {
        description: "White rice (cooked)",
        fdc_id: 169756,
        weight_g: 150,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 14,
        user_carbs: { basis: "per_100g", net_carbs: 14 },
        estimated_glycemic_index: 73,
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "150g rice, 14g carbs per 100g",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const rice = result.items[0]!;
    expect(rice.net_carbs_per_100g).toBe(14);
    expect(rice.net_carbs_g).toBe(21);
    expect(rice.food_item).not.toBeNull();
    expect(rice.food_item!.fdc_id).toBe(169756);
  });

  it("prefers user-provided carbs (total) over USDA", async () => {
    parser.setResponse("15g hummus, 2g carbs total", [
      {
        description: "Hummus",
        fdc_id: 169756,
        weight_g: 15,
        assumed_cooked: false,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 13,
        user_carbs: { basis: "total", net_carbs: 2 },
        estimated_glycemic_index: 35,
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "15g hummus, 2g carbs total",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const item = result.items[0]!;
    expect(item.net_carbs_per_100g).toBeCloseTo(13.3, 1);
    expect(item.net_carbs_g).toBe(2);
  });

  it("warns when user carbs differ significantly from USDA", async () => {
    parser.setResponse("150g rice, 5g carbs per 100g", [
      {
        description: "White rice (cooked)",
        fdc_id: 169756,
        weight_g: 150,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 5,
        user_carbs: { basis: "per_100g", net_carbs: 5 },
        estimated_glycemic_index: 73,
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "150g rice, 5g carbs per 100g",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const rice = result.items[0]!;
    expect(rice.net_carbs_per_100g).toBe(5);
    expect(rice.warning).toContain("USDA");
    expect(rice.warning).toContain("27.77");
  });

  it("populates net_carbs_per_100g from USDA match", async () => {
    parser.setResponse("120g banana", [
      {
        description: "Banana",
        fdc_id: 173944,
        weight_g: 120,
        assumed_cooked: false,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 20,
        user_carbs: null,
        estimated_glycemic_index: 51,
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "120g banana",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    expect(result.items[0]!.net_carbs_per_100g).toBe(20.2);
  });

  it("populates fat/protein from DB match", async () => {
    parser.setResponse("170g grilled chicken", [
      {
        description: "Chicken breast (grilled)",
        fdc_id: 171534,
        weight_g: 170,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 0,
        user_carbs: null,
        estimated_glycemic_index: null,
        estimated_fat_per_100g: 5,
        estimated_protein_per_100g: 28,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "170g grilled chicken",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const chicken = result.items[0]!;
    expect(chicken.fat_per_100g).toBeCloseTo(3.57, 1);
    expect(chicken.protein_per_100g).toBeCloseTo(31.02, 1);
    expect(chicken.fat_g).toBeCloseTo(6.07, 0);
    expect(chicken.protein_g).toBeCloseTo(52.73, 0);
  });

  it("uses LLM estimates for fat/protein when no DB match", async () => {
    parser.setResponse("100g mystery high-fat food", [
      {
        description: "Mystery fatty food",
        fdc_id: null,
        weight_g: 100,
        assumed_cooked: false,
        confidence: "low",
        notes: null,
        estimated_net_carbs_per_100g: 10,
        user_carbs: null,
        estimated_glycemic_index: null,
        estimated_fat_per_100g: 40,
        estimated_protein_per_100g: 20,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "100g mystery high-fat food",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    const item = result.items[0]!;
    expect(item.fat_per_100g).toBe(40);
    expect(item.protein_per_100g).toBe(20);
    expect(item.fat_g).toBe(40);
    expect(item.protein_g).toBe(20);
  });

  it("produces fat_protein_adjustment for high-fat meal", async () => {
    parser.setResponse("200g bacon", [
      {
        description: "Bacon",
        fdc_id: null,
        weight_g: 200,
        assumed_cooked: true,
        confidence: "medium",
        notes: null,
        estimated_net_carbs_per_100g: 1,
        user_carbs: null,
        estimated_glycemic_index: null,
        estimated_fat_per_100g: 42,
        estimated_protein_per_100g: 12,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "200g bacon",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    expect(result.fat_protein_adjustment).toBeDefined();
    expect(result.fat_protein_adjustment!.threshold_met).toBe("high_fat");
    expect(result.fat_protein_adjustment!.total_fat_g).toBeCloseTo(84, 0);
  });

  it("no fat_protein_adjustment for low-fat meal", async () => {
    parser.setResponse("150g rice", [
      {
        description: "White rice (cooked)",
        fdc_id: 169756,
        weight_g: 150,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 28,
        user_carbs: null,
        estimated_glycemic_index: 73,
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "150g rice",
      TEST_SETTINGS,
      undefined,
      "lunch",
    );

    expect(result.fat_protein_adjustment).toBeUndefined();
  });

  it("no fat_protein_adjustment when multiplier is 0", async () => {
    parser.setResponse("200g bacon disabled", [
      {
        description: "Bacon",
        fdc_id: null,
        weight_g: 200,
        assumed_cooked: true,
        confidence: "medium",
        notes: null,
        estimated_net_carbs_per_100g: 1,
        user_carbs: null,
        estimated_glycemic_index: null,
        estimated_fat_per_100g: 42,
        estimated_protein_per_100g: 12,
        warning: null,
      },
    ]);

    const result = await calculateOk(
      calculator,
      "200g bacon disabled",
      { ...TEST_SETTINGS, fat_protein_multiplier: 0 },
      undefined,
      "lunch",
    );

    expect(result.fat_protein_adjustment).toBeUndefined();
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

  describe("Calculator profiles", () => {
    let parser: FakeFoodParser;
    let calculator: Calculator;
    let foodDb: FoodDatabase;
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "pincho-profile-test-"));
      parser = new FakeFoodParser();
      foodDb = await createTestFoodDb(tmpDir);
      calculator = new Calculator(parser, foodDb);
    });

    afterEach(async () => {
      foodDb.close();
      await rm(tmpDir, { recursive: true });
    });

    const fiftyGramsOfCarbs = () =>
      parser.setResponse("pasta", [
        {
          description: "Pasta",
          fdc_id: null,
          weight_g: 100,
          assumed_cooked: true,
          confidence: "high",
          notes: null,
          estimated_net_carbs_per_100g: 50,
          user_carbs: null,
          estimated_glycemic_index: null,
          estimated_fat_per_100g: null,
          estimated_protein_per_100g: null,
          warning: null,
        },
      ]);

    function withProfile(
      adjustment: Settings["profiles"][number]["adjustment"],
    ): Settings {
      return {
        ...TEST_SETTINGS,
        profiles: [{ id: "p", name: "Test", emoji: "⭐", adjustment }],
        active_profile_id: "p",
      };
    }

    it("scales only the final total by the profile's percentage", async () => {
      fiftyGramsOfCarbs();
      const result = await calculateOk(
        calculator,
        "pasta",
        withProfile({ mode: "percent", percent: 20 }),
        180,
        "lunch",
      );
      expect(result.recommended_dose).toBe(5);
      expect(result.correction?.correction_dose).toBe(2);
      expect(result.total_dose).toBe(8.5);
      expect(result.profile).toEqual({ id: "p", name: "Test", percent: 20 });
    });

    it("uses the profile's own ratio for the meal window", async () => {
      fiftyGramsOfCarbs();
      const result = await calculateOk(
        calculator,
        "pasta",
        withProfile({ mode: "per_window", ratios: { lunch: 5 } }),
        undefined,
        "lunch",
      );
      expect(result.meal_window.ratio).toBe(5);
      expect(result.recommended_dose).toBe(10);
      expect(result.total_dose).toBe(10);
    });

    it("falls back to the window's ratio when the profile has none for it", async () => {
      fiftyGramsOfCarbs();
      const result = await calculateOk(
        calculator,
        "pasta",
        withProfile({ mode: "per_window", ratios: { dinner: 5 } }),
        undefined,
        "lunch",
      );
      expect(result.meal_window.ratio).toBe(10);
    });
  });
});
