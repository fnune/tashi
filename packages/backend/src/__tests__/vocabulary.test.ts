import type { CalculatedItem, FoodItem, FoodVocabEntry } from "@tashi/shared";
import { describe, expect, it } from "vitest";
import { learnVocabulary } from "../domain/vocabulary.js";

const now = new Date("2026-06-13T12:00:00.000Z");

function item(
  description: string,
  fdcId: number | null,
  overrides: Partial<CalculatedItem> = {},
): CalculatedItem {
  return {
    description,
    weight_g: 150,
    net_carbs_per_100g: 28,
    net_carbs_g: 42,
    fat_per_100g: 0,
    protein_per_100g: 0,
    fat_g: 0,
    protein_g: 0,
    assumed_cooked: true,
    confidence: "high",
    notes: null,
    warning: null,
    data_source: "sr_legacy_food",
    estimated: false,
    glycemic_index: null,
    gi_estimated: false,
    food_item:
      fdcId === null
        ? null
        : ({ fdc_id: fdcId, description: `USDA ${fdcId}` } as FoodItem),
    ...overrides,
  };
}

describe("learning vocabulary", () => {
  it("learns a matched food with its weight and the time of use", () => {
    expect(learnVocabulary([], [item("Rice", 1)], now)).toEqual([
      {
        description: "Rice",
        source: "usda_sr_legacy",
        fdc_id: 1,
        catalog_name: "USDA 1",
        default_weight_g: 150,
        use_count: 1,
        last_used: now.toISOString(),
      },
    ]);
  });

  it("ignores foods without a database match and estimates", () => {
    expect(
      learnVocabulary(
        [],
        [item("Mystery", null), item("Guess", 2, { estimated: true })],
        now,
      ),
    ).toEqual([]);
  });

  it("counts a repeat, keeps the first spelling and takes the newest weight", () => {
    const known: FoodVocabEntry[] = [
      {
        description: "Rice",
        source: "usda_sr_legacy",
        fdc_id: 1,
        catalog_name: "USDA 1",
        default_weight_g: 100,
        use_count: 4,
        last_used: "2026-01-01T00:00:00.000Z",
      },
    ];
    expect(learnVocabulary(known, [item("rice", 1)], now)).toMatchObject([
      { description: "Rice", use_count: 5, default_weight_g: 150 },
    ]);
  });

  it("counts a food listed twice in one meal twice, as one entry", () => {
    expect(
      learnVocabulary([], [item("Rice", 1), item("Rice", 1)], now),
    ).toMatchObject([{ use_count: 2 }]);
  });
});
