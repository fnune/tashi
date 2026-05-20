export interface FoodItem {
  fdc_id: number;
  description: string;
  data_type: string;
  category: string | null;
  net_carbs_per_100g: number;
  total_carbs_per_100g: number;
  fiber_per_100g: number;
  sugars_per_100g: number;
  fat_per_100g: number;
  protein_per_100g: number;
  serving_g: number | null;
  serving_desc: string | null;
  name_es: string | null;
  glycemic_index: number | null;
  gi_source: string | null;
  cooking_multiplier: number | null;
}

export type UserCarbs =
  | { basis: "per_100g"; net_carbs: number }
  | { basis: "total"; net_carbs: number };

export interface ParsedFoodItem {
  description: string;
  weight_g: number;
  fdc_id: number | null;
  assumed_cooked: boolean;
  confidence: "high" | "medium" | "low";
  notes: string | null;
  estimated_net_carbs_per_100g: number | null;
  user_carbs: UserCarbs | null;
  estimated_glycemic_index: number | null;
  estimated_fat_per_100g: number | null;
  estimated_protein_per_100g: number | null;
  warning: string | null;
}

export interface SearchTraceEntry {
  query: string;
  results: {
    fdc_id: number;
    description: string;
    net_carbs_per_100g: number;
  }[];
}

export interface ParseTrace {
  searches: SearchTraceEntry[];
  raw_response: string;
  model: string;
  duration_ms: number;
}

export interface CalculatedItem {
  description: string;
  weight_g: number;
  net_carbs_per_100g: number;
  net_carbs_g: number;
  fat_per_100g: number;
  protein_per_100g: number;
  fat_g: number;
  protein_g: number;
  assumed_cooked: boolean;
  confidence: "high" | "medium" | "low";
  notes: string | null;
  warning: string | null;
  data_source: string;
  estimated: boolean;
  glycemic_index: number | null;
  gi_estimated: boolean;
  food_item: FoodItem | null;
}

export interface MealWindow {
  name: string;
  start_hour: number;
  end_hour: number;
  ratio: number;
}

export type GlucoseUnit = "mg/dL" | "mmol/L";

export interface Settings {
  meal_windows: MealWindow[];
  correction_factor: number | null;
  target_blood_sugar: number;
  glucose_unit: GlucoseUnit;
  pen_increment: 0.5 | 1;
  fat_protein_multiplier: number;
  language: "en" | "es";
}

export interface CalculationResult {
  id: string;
  timestamp: string;
  input_text: string;
  language: "en" | "es";
  meal_window: MealWindow;
  items: CalculatedItem[];
  total_net_carbs_g: number;
  recommended_dose: number;
  correction?: {
    current_blood_sugar: number;
    target_blood_sugar: number;
    correction_factor: number;
    correction_dose: number;
    total_dose: number;
  };
  fat_protein_adjustment?: {
    total_fat_g: number;
    total_protein_g: number;
    threshold_met: string;
    multiplier: number;
    adjustment_dose: number;
    total_dose: number;
  };
  trace?: ParseTrace;
}

// --- Timeline entries ---

interface BaseEntry {
  id: string;
  timestamp: string;
}

export interface MealEntry extends BaseEntry {
  type: "meal";
  input_text: string;
  language: "en" | "es";
  meal_window: MealWindow;
  items: CalculatedItem[];
  total_net_carbs_g: number;
  recommended_dose?: number;
  correction?: CalculationResult["correction"];
  fat_protein_adjustment?: CalculationResult["fat_protein_adjustment"];
  trace?: ParseTrace;
}

export interface FastInsulinEntry extends BaseEntry {
  type: "fast_insulin";
  units: number;
  related_meal_id: string | null;
}

export interface SlowInsulinEntry extends BaseEntry {
  type: "slow_insulin";
  units: number;
}

export interface GlucoseEntry extends BaseEntry {
  type: "glucose_reading";
  value: number;
  unit: GlucoseUnit;
}

export type TimelineEntry =
  | MealEntry
  | FastInsulinEntry
  | SlowInsulinEntry
  | GlucoseEntry;

// --- API ---

export interface CalculateRequest {
  food_description: string;
  current_blood_sugar?: number;
  meal_window_override?: string;
  pre_bolus_minutes?: number;
}

export type CalculateResponse =
  | {
      status: "ok";
      result: CalculationResult;
      meal_entry_id: string;
      insulin_entry_id: string;
    }
  | {
      status: "needs_clarification";
      message: string;
      raw_response?: string;
    }
  | {
      status: "rejected";
      message: string;
    };

export interface ErrorResponse {
  error: string;
}

export type CreateTimelineRequest =
  | { type: "fast_insulin"; units: number }
  | { type: "slow_insulin"; units: number }
  | { type: "glucose_reading"; value: number; unit: GlucoseUnit };

export type UpdateTimelineRequest =
  | { type: "meal"; timestamp?: string }
  | { type: "fast_insulin"; timestamp?: string; units?: number }
  | { type: "slow_insulin"; timestamp?: string; units?: number }
  | { type: "glucose_reading"; timestamp?: string; value?: number };

// --- Food vocabulary (learned from past parses) ---

export interface FoodVocabEntry {
  description: string;
  fdc_id: number;
  usda_description: string;
  default_weight_g: number;
  use_count: number;
  last_used: string;
}

export const DEFAULT_SETTINGS: Settings = {
  meal_windows: [
    { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
    { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    { name: "dinner", start_hour: 16, end_hour: 23, ratio: 12 },
  ],
  correction_factor: null,
  target_blood_sugar: 100,
  glucose_unit: "mg/dL",
  pen_increment: 0.5,
  fat_protein_multiplier: 0.2,
  language: "en",
};
