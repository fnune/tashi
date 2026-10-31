import type { FoodSourceId } from "./food-sources.js";
import type { BasalInsulinId, BolusInsulinId } from "./insulin.js";

export interface FoodItem {
  fdc_id: number;
  description: string;
  data_type: string;
  category: string | null;
  net_carbs_per_100g: number;
  total_carbs_per_100g: number;
  fiber_per_100g: number | null;
  sugars_per_100g: number | null;
  fat_per_100g: number | null;
  protein_per_100g: number | null;
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

export type RatioFormat = "grams_per_unit" | "units_per_10g";

export type ProfileAdjustment =
  | { mode: "percent"; percent: number }
  | { mode: "per_window"; ratios: Record<string, number> };

export interface Profile {
  id: string;
  name: string;
  emoji: string;
  adjustment: ProfileAdjustment;
}

export interface CycleTracking {
  enabled: boolean;
  last_period_start: string | null;
  length_days: number;
}

export interface AppliedProfile {
  id: string;
  name: string;
  percent: number;
}

export interface Settings {
  meal_windows: MealWindow[];
  correction_factor: number | null;
  target_blood_sugar: number;
  glucose_unit: GlucoseUnit;
  ratio_format: RatioFormat;
  pen_increment: 0.5 | 1;
  fat_protein_multiplier: number;
  bolus_insulin_id: BolusInsulinId | null;
  basal_insulin_id: BasalInsulinId | null;
  insulin_action_minutes: number | null;
  language: "en" | "es";
  profiles: Profile[];
  active_profile_id: string;
  cycle: CycleTracking;
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
  total_dose?: number;
  profile?: AppliedProfile;
  correction?: {
    current_blood_sugar: number;
    target_blood_sugar: number;
    correction_factor: number;
    correction_dose: number;
    iob: number;
    iob_reduction: number;
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
  time_zone: string;
}

export interface MealEntry extends BaseEntry {
  type: "meal";
  input_text: string;
  language: "en" | "es";
  meal_window: MealWindow;
  items: CalculatedItem[];
  total_net_carbs_g: number;
  recommended_dose: number;
  total_dose: number;
  correction?: CalculationResult["correction"];
  fat_protein_adjustment?: CalculationResult["fat_protein_adjustment"];
  trace?: ParseTrace;
}

export interface FastInsulinEntry extends BaseEntry {
  type: "fast_insulin";
  units: number;
  insulin_id: BolusInsulinId;
  related_meal_id: string | null;
}

export interface SlowInsulinEntry extends BaseEntry {
  type: "slow_insulin";
  units: number;
  insulin_id: BasalInsulinId;
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
}

export type CalculateResponse =
  | {
      status: "ok";
      result: CalculationResult;
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

export interface LogMealRequest {
  result: CalculationResult;
  units: number;
  pre_bolus_minutes?: number;
  injected_at?: string;
}

export interface TimelinePageResponse {
  entries: TimelineEntry[];
  next_cursor: string | null;
}

export const DIARY_FORMAT = "tashi-diary";
export const DIARY_VERSION = 1;
export const IMPORT_ENTRIES_PER_REQUEST = 5;

export interface Diary {
  format: typeof DIARY_FORMAT;
  version: typeof DIARY_VERSION;
  exported_at: string;
  settings: Settings;
  vocabulary: FoodVocabEntry[];
  timeline: TimelineEntry[];
}

export interface StartImportRequest {
  settings: Settings;
  vocabulary: FoodVocabEntry[];
}

export interface ImportEntriesRequest {
  entries: TimelineEntry[];
}

export interface LogMealResponse {
  meal_entry_id: string;
  insulin_entry_id: string | null;
}

export type ApiErrorCode =
  | "bolus_insulin_not_configured"
  | "basal_insulin_not_configured"
  | "insulin_action_not_configured"
  | "no_meal_window"
  | "injection_in_future"
  | "api_key_missing"
  | "api_key_invalid"
  | "api_key_storage_unavailable"
  | "signed_out"
  | "credit_exhausted"
  | "sign_in_failed"
  | "sign_in_throttled"
  | "password_too_short"
  | "validation_failed"
  | "not_found"
  | "internal_error";

export interface UsageSummary {
  calculations: number;
  estimated_cost_usd: number | null;
  prices_checked_on: string;
}

export interface ApiKeyStatus {
  configured: boolean;
  source: "settings" | "environment" | null;
  can_save: boolean;
}

export interface SetApiKeyRequest {
  api_key: string;
}

export interface ErrorResponse {
  error: string;
  code?: ApiErrorCode;
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
  source: FoodSourceId;
  fdc_id: number;
  catalog_name: string;
  default_weight_g: number;
  use_count: number;
  last_used: string;
}

export const NORMAL_PROFILE_ID = "normal";

export const DEFAULT_SETTINGS: Settings = {
  meal_windows: [
    { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
    { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    { name: "dinner", start_hour: 16, end_hour: 6, ratio: 12 },
  ],
  correction_factor: null,
  target_blood_sugar: 100,
  glucose_unit: "mg/dL",
  ratio_format: "grams_per_unit",
  pen_increment: 0.5,
  fat_protein_multiplier: 0.2,
  bolus_insulin_id: null,
  basal_insulin_id: null,
  insulin_action_minutes: null,
  language: "en",
  profiles: [
    {
      id: NORMAL_PROFILE_ID,
      name: "",
      emoji: "◎",
      adjustment: { mode: "percent", percent: 0 },
    },
    {
      id: "sport",
      name: "",
      emoji: "run",
      adjustment: { mode: "percent", percent: -20 },
    },
    {
      id: "sick",
      name: "",
      emoji: "thermo",
      adjustment: { mode: "percent", percent: 20 },
    },
    {
      id: "menstruation",
      name: "",
      emoji: "drop",
      adjustment: { mode: "percent", percent: 15 },
    },
  ],
  active_profile_id: NORMAL_PROFILE_ID,
  cycle: { enabled: false, last_period_start: null, length_days: 28 },
};
