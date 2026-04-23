import { describe, expect, it } from "vitest";
import { calculateDose, evaluateFatProteinThreshold } from "../calculation.js";
import type { CalculatedItem, Settings } from "../types.js";

const BASE_SETTINGS: Settings = {
  meal_windows: [{ name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 }],
  correction_factor: 40,
  target_blood_sugar: 100,
  glucose_unit: "mg/dL",
  pen_increment: 0.5,
  fat_protein_multiplier: 0.2,
  language: "en",
};

function makeItem(overrides: Partial<CalculatedItem> = {}): CalculatedItem {
  return {
    description: "Test food",
    weight_g: 100,
    net_carbs_per_100g: 30,
    net_carbs_g: 30,
    fat_per_100g: 0,
    protein_per_100g: 0,
    fat_g: 0,
    protein_g: 0,
    assumed_cooked: false,
    confidence: "high",
    notes: null,
    warning: null,
    data_source: "test",
    estimated: false,
    glycemic_index: null,
    gi_estimated: false,
    food_item: null,
    ...overrides,
  };
}

describe("evaluateFatProteinThreshold", () => {
  it("returns met: false when items have zero fat and protein", () => {
    const items = [makeItem({ fat_g: 0, protein_g: 0 })];
    const result = evaluateFatProteinThreshold(items);
    expect(result.met).toBe(false);
  });

  it("returns met: false when below all thresholds", () => {
    const items = [makeItem({ fat_g: 10, protein_g: 10 })];
    const result = evaluateFatProteinThreshold(items);
    expect(result.met).toBe(false);
  });

  it("triggers high_fat when total fat > 30g", () => {
    const items = [makeItem({ fat_g: 35, protein_g: 5 })];
    const result = evaluateFatProteinThreshold(items);
    expect(result.met).toBe(true);
    expect(result.reason).toBe("high_fat");
    expect(result.total_fat_g).toBe(35);
    expect(result.total_protein_g).toBe(5);
  });

  it("triggers fat_and_protein when fat > 15g and protein > 25g", () => {
    const items = [makeItem({ fat_g: 20, protein_g: 30 })];
    const result = evaluateFatProteinThreshold(items);
    expect(result.met).toBe(true);
    expect(result.reason).toBe("fat_and_protein");
  });

  it("triggers energy_ratio when fat+protein energy > 80% of total", () => {
    // 5g fat (45 kcal) + 40g protein (160 kcal) = 205 kcal
    // 5g carbs (20 kcal), total = 225 kcal, ratio = 205/225 = 91%
    const items = [
      makeItem({
        fat_g: 5,
        protein_g: 40,
        net_carbs_g: 5,
      }),
    ];
    const result = evaluateFatProteinThreshold(items);
    expect(result.met).toBe(true);
    expect(result.reason).toBe("energy_ratio");
  });

  it("sums across multiple items", () => {
    const items = [
      makeItem({ fat_g: 18, protein_g: 5 }),
      makeItem({ fat_g: 15, protein_g: 3 }),
    ];
    const result = evaluateFatProteinThreshold(items);
    expect(result.met).toBe(true);
    expect(result.reason).toBe("high_fat");
    expect(result.total_fat_g).toBe(33);
  });

  it("checks thresholds in priority order (high_fat before fat_and_protein)", () => {
    // 35g fat > 30g (high_fat) AND fat > 15g + protein > 25g (fat_and_protein)
    const items = [makeItem({ fat_g: 35, protein_g: 30 })];
    const result = evaluateFatProteinThreshold(items);
    expect(result.reason).toBe("high_fat");
  });

  it("does not trigger energy_ratio when total energy is zero", () => {
    const items = [makeItem({ fat_g: 0, protein_g: 0, net_carbs_g: 0 })];
    const result = evaluateFatProteinThreshold(items);
    expect(result.met).toBe(false);
  });
});

describe("calculateDose fat/protein adjustment", () => {
  it("no adjustment when fat_protein_multiplier is 0", () => {
    const settings = { ...BASE_SETTINGS, fat_protein_multiplier: 0 };
    const items = [makeItem({ fat_g: 40, protein_g: 30, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, settings);
    expect(result.fat_protein_adjustment).toBeUndefined();
  });

  it("no adjustment when threshold not met", () => {
    const items = [makeItem({ fat_g: 5, protein_g: 5, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS);
    expect(result.fat_protein_adjustment).toBeUndefined();
  });

  it("applies adjustment when threshold met", () => {
    // 50g carbs / ratio 10 = 5U food dose
    // 5U * 0.20 = 1U adjustment
    const items = [makeItem({ fat_g: 35, protein_g: 10, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS);
    expect(result.fat_protein_adjustment).toBeDefined();
    expect(result.fat_protein_adjustment!.adjustment_dose).toBe(1);
    expect(result.fat_protein_adjustment!.multiplier).toBe(0.2);
    expect(result.fat_protein_adjustment!.threshold_met).toBe("high_fat");
  });

  it("total_dose = foodDose + adjustment_dose without correction", () => {
    const items = [makeItem({ fat_g: 35, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS);
    expect(result.fat_protein_adjustment!.total_dose).toBe(
      result.foodDose + result.fat_protein_adjustment!.adjustment_dose,
    );
  });

  it("total_dose includes correction when both apply", () => {
    const items = [makeItem({ fat_g: 35, net_carbs_g: 50 })];
    // blood sugar 180, target 100, factor 40 => correction = 2U
    const result = calculateDose(items, 10, BASE_SETTINGS, 180);
    expect(result.correction).toBeDefined();
    expect(result.fat_protein_adjustment).toBeDefined();
    const expected =
      result.foodDose +
      result.correction!.correction_dose +
      result.fat_protein_adjustment!.adjustment_dose;
    expect(result.fat_protein_adjustment!.total_dose).toBe(expected);
  });

  it("rounds adjustment_dose to pen_increment", () => {
    // 30g carbs / ratio 10 = 3U food dose
    // 3U * 0.20 = 0.6 => rounds to 0.5 with pen_increment 0.5
    const items = [makeItem({ fat_g: 35, net_carbs_g: 30 })];
    const result = calculateDose(items, 10, BASE_SETTINGS);
    expect(result.fat_protein_adjustment!.adjustment_dose).toBe(0.5);
  });

  it("total_dose is never negative", () => {
    // Very low carbs, hypo correction pulling dose down
    const items = [makeItem({ fat_g: 35, net_carbs_g: 5 })];
    const result = calculateDose(items, 10, BASE_SETTINGS, 40);
    expect(result.fat_protein_adjustment!.total_dose).toBeGreaterThanOrEqual(0);
  });

  it("uses custom multiplier from settings", () => {
    const settings = { ...BASE_SETTINGS, fat_protein_multiplier: 0.5 };
    // 50g carbs / ratio 10 = 5U food dose
    // 5U * 0.50 = 2.5U adjustment
    const items = [makeItem({ fat_g: 35, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, settings);
    expect(result.fat_protein_adjustment!.adjustment_dose).toBe(2.5);
  });
});
