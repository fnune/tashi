import type {
  FastInsulinEntry,
  FoodItem,
  GlucoseEntry,
  MealEntry,
  SlowInsulinEntry,
} from "@tashi/shared";
import { uuidNumber } from "./sequential-ids.js";
import { RICE, testFoodItem } from "./test-catalog.js";

export const ZONE = "Europe/Berlin";

export function at(minutes: number): string {
  return new Date(Date.UTC(2026, 5, 13, 8, minutes)).toISOString();
}

export function glucose(n: number, minutes: number, value = 120): GlucoseEntry {
  return {
    id: uuidNumber(n),
    timestamp: at(minutes),
    time_zone: ZONE,
    type: "glucose_reading",
    value,
    unit: "mg/dL",
  };
}

export function slowInsulin(n: number, minutes: number): SlowInsulinEntry {
  return {
    id: uuidNumber(n),
    timestamp: at(minutes),
    time_zone: ZONE,
    type: "slow_insulin",
    units: 10,
    insulin_id: "tresiba",
  };
}

export function fastInsulin(
  n: number,
  minutes: number,
  relatedMeal: number | null = null,
): FastInsulinEntry {
  return {
    id: uuidNumber(n),
    timestamp: at(minutes),
    time_zone: ZONE,
    type: "fast_insulin",
    units: 4,
    insulin_id: "novorapid",
    related_meal_id: relatedMeal === null ? null : uuidNumber(relatedMeal),
  };
}

export function foodItem(): FoodItem {
  return testFoodItem(RICE);
}

export function simpleMeal(n: number, minutes: number): MealEntry {
  return {
    id: uuidNumber(n),
    timestamp: at(minutes),
    time_zone: ZONE,
    type: "meal",
    input_text: "a mystery snack",
    language: "en",
    meal_window: { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    items: [
      {
        description: "Mystery snack",
        weight_g: 50,
        net_carbs_per_100g: 40,
        net_carbs_g: 20,
        fat_per_100g: 5,
        protein_per_100g: 3,
        fat_g: 2.5,
        protein_g: 1.5,
        assumed_cooked: false,
        confidence: "low",
        notes: null,
        warning: null,
        data_source: "LLM estimate",
        estimated: true,
        glycemic_index: null,
        gi_estimated: false,
        food_item: null,
      },
    ],
    total_net_carbs_g: 20,
    carb_units: 2,
    total_units: 2,
  };
}

export function fullMeal(n: number, minutes: number): MealEntry {
  const base = simpleMeal(n, minutes);
  return {
    ...base,
    input_text: "150g arroz blanco cocido",
    language: "es",
    items: [
      {
        description: "Arroz blanco cocido",
        weight_g: 150,
        net_carbs_per_100g: 28,
        net_carbs_g: 30,
        fat_per_100g: 0.3,
        protein_per_100g: 2.7,
        fat_g: 0.5,
        protein_g: 4,
        assumed_cooked: true,
        confidence: "high",
        notes: "Cooked weight assumed",
        warning: "Check the portion",
        data_source: "sr_legacy_food",
        estimated: false,
        glycemic_index: 73,
        gi_estimated: false,
        food_item: foodItem(),
      },
      base.items[0] as MealEntry["items"][number],
    ],
    total_net_carbs_g: 30,
    carb_units: 3,
    total_units: 5.5,
    correction: {
      current_blood_sugar: 180,
      target_blood_sugar: 100,
      correction_factor: 40,
      correction_units: 2,
      iob: 0,
      iob_reduction: 0,
      total_units: 5,
    },
    fat_protein_adjustment: {
      total_fat_g: 30,
      total_protein_g: 70,
      threshold_met: "energy_ratio",
      multiplier: 0.2,
      adjustment_units: 0.6,
      total_units: 5.5,
    },
    trace: {
      searches: [
        {
          query: "white rice",
          results: [
            {
              fdc_id: 169757,
              description: "Rice, white",
              net_carbs_per_100g: 28,
            },
          ],
        },
      ],
      raw_response: "{}",
      model: "fake",
      duration_ms: 12,
    },
  };
}
