import { describe, expect, it } from "vitest";
import {
  calculateDose,
  correctionComponents,
  evaluateFatProteinThreshold,
  findMealWindow,
  localHour,
  recalculateResult,
  uncoveredHours,
  withWeight,
} from "../calculation.js";
import type { CalculatedItem, CalculationResult, Settings } from "../types.js";

const BASE_SETTINGS: Settings = {
  meal_windows: [{ name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 }],
  correction_factor: 40,
  target_blood_sugar: 100,
  glucose_unit: "mg/dL",
  ratio_format: "grams_per_unit",
  pen_increment: 0.5,
  fat_protein_multiplier: 0.2,
  bolus_insulin_id: "novorapid",
  basal_insulin_id: "tresiba",
  insulin_action_minutes: 300,
  language: "en",
  profiles: [],
  active_profile_id: "normal",
  cycle: { enabled: false, last_period_start: null, length_days: 28 },
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

describe("calculateDose rounding", () => {
  it("rounds only the final total, not individual components", () => {
    // 14g carbs / ratio 10 = 1.4 raw food dose
    // blood sugar 170, target 100, factor 50 => raw correction = 1.4
    // raw total = 2.8, rounded to 0.5 => 3.0
    const settings: Settings = {
      ...BASE_SETTINGS,
      correction_factor: 50,
    };
    const items = [makeItem({ net_carbs_g: 14 })];
    const result = calculateDose(items, 10, settings, 170);
    expect(result.correction!.correction_dose).toBe(1.4);
    expect(result.correction!.total_dose).toBe(3);
  });

  it("avoids compounding rounding errors from individual components", () => {
    // 3g carbs / ratio 10 = 0.3 raw food dose
    // blood sugar 112, target 100, factor 40 => raw correction = 0.3
    // Individually rounded: food 0.5 + correction 0.5 = 1.0
    // Correctly from raw sum: round(0.3 + 0.3, 0.5) = round(0.6) = 0.5
    const items = [makeItem({ net_carbs_g: 3 })];
    const result = calculateDose(items, 10, BASE_SETTINGS, 112);
    expect(result.correction!.total_dose).toBe(0.5);
  });
});

describe("calculateDose insulin on board", () => {
  it("subtracts IOB from a positive correction, never the meal dose", () => {
    // 50g / 10 = 5U food; BG 200 target 100 factor 40 => raw correction 2.5U
    // IOB 1.0 => correction 1.5U; total = round(5 + 1.5) = 6.5
    const items = [makeItem({ net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS, 200, 1.0);
    expect(result.correction!.iob).toBe(1);
    expect(result.correction!.iob_reduction).toBe(1);
    expect(result.correction!.correction_dose).toBe(1.5);
    expect(result.correction!.total_dose).toBe(6.5);
  });

  it("does not reduce the meal dose when blood sugar is at target", () => {
    // BG at target => no correction to cancel; IOB must not touch meal coverage
    const items = [makeItem({ net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS, 100, 40);
    expect(result.correction!.iob_reduction).toBe(0);
    expect(result.correction!.correction_dose).toBe(0);
    expect(result.correction!.total_dose).toBe(5);
  });

  it("caps the IOB reduction at the size of the correction", () => {
    // BG 140 target 100 factor 40 => raw correction 1.0U; IOB 5 caps at 1.0
    const items = [makeItem({ net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS, 140, 5);
    expect(result.correction!.iob_reduction).toBe(1);
    expect(result.correction!.correction_dose).toBe(0);
    expect(result.correction!.total_dose).toBe(5);
  });

  it("ignores IOB with no correction (no blood sugar entered)", () => {
    const items = [makeItem({ net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS, undefined, 40);
    expect(result.correction).toBeUndefined();
    expect(result.foodDose).toBe(5);
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
    // 50g carbs / ratio 10 = 5U raw food dose
    // 5U * 0.20 = 1U adjustment
    const items = [makeItem({ fat_g: 35, protein_g: 10, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS);
    expect(result.fat_protein_adjustment).toBeDefined();
    expect(result.fat_protein_adjustment!.adjustment_dose).toBe(1);
    expect(result.fat_protein_adjustment!.multiplier).toBe(0.2);
    expect(result.fat_protein_adjustment!.threshold_met).toBe("high_fat");
  });

  it("total_dose = round(rawFood + rawAdjustment) without correction", () => {
    // 50g carbs / ratio 10 = 5U raw food, 5 * 0.2 = 1U fp
    // total = round(5 + 1, 0.5) = 6
    const items = [makeItem({ fat_g: 35, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, BASE_SETTINGS);
    expect(result.fat_protein_adjustment!.total_dose).toBe(6);
  });

  it("total_dose includes correction when both apply", () => {
    const items = [makeItem({ fat_g: 35, net_carbs_g: 50 })];
    // 50g / 10 = 5U food, blood sugar 180 target 100 factor 40 => 2U correction
    // 5 * 0.2 = 1U fp, total = round(5 + 2 + 1, 0.5) = 8
    const result = calculateDose(items, 10, BASE_SETTINGS, 180);
    expect(result.correction).toBeDefined();
    expect(result.fat_protein_adjustment).toBeDefined();
    expect(result.fat_protein_adjustment!.total_dose).toBe(8);
  });

  it("rounds adjustment_dose for display only", () => {
    // 30g carbs / ratio 10 = 3U raw food dose
    // 3U * 0.20 = 0.6 => display-rounded to 0.6, NOT pen-rounded to 0.5
    const items = [makeItem({ fat_g: 35, net_carbs_g: 30 })];
    const result = calculateDose(items, 10, BASE_SETTINGS);
    expect(result.fat_protein_adjustment!.adjustment_dose).toBe(0.6);
  });

  it("total_dose is never negative", () => {
    const items = [makeItem({ fat_g: 35, net_carbs_g: 5 })];
    const result = calculateDose(items, 10, BASE_SETTINGS, 40);
    expect(result.fat_protein_adjustment!.total_dose).toBeGreaterThanOrEqual(0);
  });

  it("uses custom multiplier from settings", () => {
    const settings = { ...BASE_SETTINGS, fat_protein_multiplier: 0.5 };
    // 50g carbs / ratio 10 = 5U raw food dose
    // 5U * 0.50 = 2.5U adjustment
    const items = [makeItem({ fat_g: 35, net_carbs_g: 50 })];
    const result = calculateDose(items, 10, settings);
    expect(result.fat_protein_adjustment!.adjustment_dose).toBe(2.5);
  });
});

describe("findMealWindow", () => {
  const settings: Settings = {
    ...BASE_SETTINGS,
    meal_windows: [
      { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
      { name: "dinner", start_hour: 16, end_hour: 24, ratio: 12 },
      { name: "night", start_hour: 0, end_hour: 6, ratio: 15 },
    ],
  };
  const at = (hour: number) => new Date(2026, 5, 13, hour, 30);

  it("matches the start hour and excludes the end hour", () => {
    expect(findMealWindow(settings, at(11))?.name).toBe("lunch");
    expect(findMealWindow(settings, at(16))?.name).toBe("dinner");
  });

  it("covers the last hour of the day when the window ends at 24", () => {
    expect(findMealWindow(settings, at(23))?.name).toBe("dinner");
  });

  it("returns null for uncovered hours", () => {
    expect(findMealWindow(settings, at(8))).toBeNull();
  });

  it("matches windows that run past midnight", () => {
    const overnight: Settings = {
      ...BASE_SETTINGS,
      meal_windows: [{ name: "rest", start_hour: 23, end_hour: 6, ratio: 10 }],
    };
    expect(findMealWindow(overnight, at(23))?.name).toBe("rest");
    expect(findMealWindow(overnight, at(2))?.name).toBe("rest");
    expect(findMealWindow(overnight, at(6))).toBeNull();
  });
});

describe("uncoveredHours", () => {
  const w = (start_hour: number, end_hour: number) => ({
    name: "w",
    start_hour,
    end_hour,
    ratio: 10,
  });

  it("is empty when the windows tile the day", () => {
    expect(uncoveredHours([w(6, 16), w(16, 6)])).toEqual([]);
  });

  it("treats a window that starts where it ends as the whole day", () => {
    expect(uncoveredHours([w(0, 0)])).toEqual([]);
  });

  it("reports a gap that runs past midnight as one range", () => {
    expect(uncoveredHours([w(6, 11), w(11, 16), w(16, 23)])).toEqual([
      { start_hour: 23, end_hour: 6 },
    ]);
  });

  it("reports every gap", () => {
    expect(uncoveredHours([w(0, 6), w(8, 20)])).toEqual([
      { start_hour: 6, end_hour: 8 },
      { start_hour: 20, end_hour: 0 },
    ]);
  });

  it("reports the whole day when there are no windows", () => {
    expect(uncoveredHours([])).toEqual([{ start_hour: 0, end_hour: 24 }]);
  });
});

describe("correctionComponents", () => {
  it("lets insulin on board cancel a high-glucose correction", () => {
    expect(correctionComponents(180, BASE_SETTINGS, 0.5)).toEqual({
      correctionFactor: 40,
      iobReduction: 0.5,
      units: 1.5,
    });
  });

  it("never lets insulin on board push the correction below zero", () => {
    expect(correctionComponents(120, BASE_SETTINGS, 3)?.units).toBe(0);
  });

  it("keeps a negative correction below target regardless of IOB", () => {
    expect(correctionComponents(80, BASE_SETTINGS, 1)?.units).toBe(-0.5);
  });

  it("is null without a correction factor", () => {
    expect(
      correctionComponents(
        180,
        { ...BASE_SETTINGS, correction_factor: null },
        0,
      ),
    ).toBeNull();
  });
});

describe("recalculateResult", () => {
  const original: CalculationResult = {
    id: "meal",
    timestamp: "2026-10-10T13:00:00Z",
    input_text: "100 g rice",
    language: "en",
    meal_window: { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    items: [makeItem()],
    total_net_carbs_g: 30,
    recommended_dose: 3,
    total_dose: 3.5,
    profile: { id: "sick", name: "", percent: 20 },
  };

  it("scales a food's macros with its new weight", () => {
    const heavier = withWeight(makeItem({ fat_per_100g: 10 }), 200);
    expect(heavier.net_carbs_g).toBe(60);
    expect(heavier.fat_g).toBe(20);
  });

  it("recomputes the dose with the result's ratio and profile", () => {
    const result = recalculateResult(
      original,
      [withWeight(makeItem(), 200)],
      BASE_SETTINGS,
    );
    expect(result.total_net_carbs_g).toBe(60);
    expect(result.recommended_dose).toBe(6);
    expect(result.total_dose).toBe(7);
  });

  it("keeps the glucose reading the result was made with", () => {
    const corrected = recalculateResult(
      {
        ...original,
        correction: {
          current_blood_sugar: 180,
          target_blood_sugar: 100,
          correction_factor: 40,
          correction_dose: 2,
          iob: 0,
          iob_reduction: 0,
          total_dose: 5,
        },
      },
      original.items,
      BASE_SETTINGS,
    );
    expect(corrected.correction?.correction_dose).toBe(2);
    expect(corrected.total_dose).toBe(6);
  });
});

describe("localHour", () => {
  const utc = (iso: string) => new Date(`${iso}Z`);

  it("reads the hour in the given zone regardless of the machine zone", () => {
    const instant = utc("2026-06-13T12:30:00");
    expect(localHour(instant, "UTC")).toBe(12);
    expect(localHour(instant, "Europe/Berlin")).toBe(14);
    expect(localHour(instant, "Europe/Madrid")).toBe(14);
    expect(localHour(instant, "America/New_York")).toBe(8);
  });

  it("wraps past midnight", () => {
    expect(localHour(utc("2026-06-13T22:30:00"), "Europe/Berlin")).toBe(0);
    expect(localHour(utc("2026-06-13T03:30:00"), "America/New_York")).toBe(23);
  });

  it("follows daylight saving changes", () => {
    expect(localHour(utc("2026-03-29T00:59:00"), "Europe/Berlin")).toBe(1);
    expect(localHour(utc("2026-03-29T01:00:00"), "Europe/Berlin")).toBe(3);
    expect(localHour(utc("2026-03-08T06:59:00"), "America/New_York")).toBe(1);
    expect(localHour(utc("2026-03-08T07:00:00"), "America/New_York")).toBe(3);
    expect(localHour(utc("2026-11-01T05:30:00"), "America/New_York")).toBe(1);
    expect(localHour(utc("2026-11-01T06:30:00"), "America/New_York")).toBe(1);
  });

  it("falls back to the machine zone without or with an invalid zone", () => {
    const instant = utc("2026-06-13T12:30:00");
    expect(localHour(instant)).toBe(instant.getHours());
    expect(localHour(instant, "")).toBe(instant.getHours());
    expect(localHour(instant, "Not/AZone")).toBe(instant.getHours());
  });
});

describe("findMealWindow with a time zone", () => {
  const settings: Settings = {
    ...BASE_SETTINGS,
    meal_windows: [
      { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
      { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
      { name: "dinner", start_hour: 16, end_hour: 6, ratio: 12 },
    ],
  };
  const instant = new Date("2026-06-13T04:30:00Z");

  it("picks the window of the user's zone, including the wrap past midnight", () => {
    expect(findMealWindow(settings, instant, "UTC")?.name).toBe("dinner");
    expect(findMealWindow(settings, instant, "Europe/Berlin")?.name).toBe(
      "morning",
    );
    expect(findMealWindow(settings, instant, "Europe/Madrid")?.name).toBe(
      "morning",
    );
    expect(findMealWindow(settings, instant, "America/New_York")?.name).toBe(
      "dinner",
    );
  });
});
