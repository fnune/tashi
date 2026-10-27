import type { ColumnType, Generated, JSONColumnType } from "kysely";

type Timestamp = ColumnType<Date, Date | string, Date | string>;
type DateOnly = ColumnType<string, string, string>;
type Json<T extends object | null> = JSONColumnType<T>;
type NullableJson<T extends object> = ColumnType<T | null, string | null, string | null>;

export interface InsulinProductsTable {
  id: string;
  action: "bolus" | "basal";
}

export interface FoodSourcesTable {
  id: string;
  catalog: boolean;
  estimate: boolean;
}

export interface CatalogReleasesTable {
  id: number;
  label: string;
  imported_at: Timestamp;
}

export interface SettingsTable {
  singleton: boolean;
  language: "en" | "es";
  glucose_unit: "mg/dL" | "mmol/L";
  ratio_format: "grams_per_unit" | "units_per_10g";
  pen_increment_units: 0.5 | 1;
  target_glucose_mg_dl: number;
  glucose_drop_mg_dl_per_unit: number | null;
  fat_protein_multiplier: number;
  bolus_insulin: string | null;
  bolus_action: Generated<"bolus">;
  basal_insulin: string | null;
  basal_action: Generated<"basal">;
  insulin_action_minutes: number | null;
  cycle_tracking_enabled: boolean;
  cycle_length_days: number;
  last_period_start: DateOnly | null;
  active_profile_id: string;
}

export interface MealWindowsTable {
  id: string;
  position: number;
  name: string;
  start_hour: number;
  end_hour: number;
  carbs_g_per_unit: number;
}

export interface ProfilesTable {
  id: string;
  position: number;
  name: string | null;
  icon: string;
  adjustment_mode: "percent" | "per_window";
  percent_adjustment: number | null;
}

export interface ProfileWindowRatiosTable {
  profile_id: string;
  adjustment_mode: Generated<"per_window">;
  window_id: string;
  carbs_g_per_unit: number;
}

export interface RatioVersionsTable {
  id: string;
  window_name: string;
  window_start_hour: number;
  window_end_hour: number;
  profile_id: string | null;
  profile_name: string | null;
  adjustment_mode: "percent" | "per_window" | null;
  percent_adjustment: number | null;
  carbs_g_per_unit: number;
  first_used_at: Timestamp;
}

export interface GlucoseEntriesTable {
  id: string;
  occurred_at: Timestamp;
  occurred_tz: string;
  glucose_mg_dl: number;
}

export interface SlowInsulinEntriesTable {
  id: string;
  occurred_at: Timestamp;
  occurred_tz: string;
  insulin: string;
  action: "basal";
  insulin_units: number;
}

export interface FastInsulinEntriesTable {
  id: string;
  occurred_at: Timestamp;
  occurred_tz: string;
  insulin: string;
  action: "bolus";
  insulin_units: number;
  meal_entry_id: string | null;
}

export interface MealEntriesTable {
  id: string;
  occurred_at: Timestamp;
  occurred_tz: string;
  input_text: string;
  input_language: "en" | "es";
  ratio_version_id: string;
  total_carbs_g: number;
  carb_dose_units: number;
  total_dose_units: number;
  catalog_release: number;
}

export interface MealItemsTable {
  meal_entry_id: string;
  position: number;
  description: string;
  weight_g: number;
  assumed_cooked: boolean;
  confidence: "high" | "medium" | "low";
  source: string;
  carbs_per_100g: number;
  carbs_g: number;
  fat_per_100g: number;
  fat_g: number;
  protein_per_100g: number;
  protein_g: number;
  glycemic_index: number | null;
  gi_estimated: boolean;
  notes: string | null;
  warning: string | null;
  external_id: string | null;
  food_snapshot: NullableJson<Record<string, unknown>>;
}

export interface MealCorrectionsTable {
  meal_entry_id: string;
  current_glucose_mg_dl: number;
  target_glucose_mg_dl: number;
  glucose_drop_mg_dl_per_unit: number;
  correction_dose_units: number;
  iob_units: number;
  iob_reduction_units: number;
}

export interface MealFatProteinAdjustmentsTable {
  meal_entry_id: string;
  total_fat_g: number;
  total_protein_g: number;
  trigger: "high_fat" | "fat_and_protein" | "energy_ratio";
  multiplier: number;
  adjustment_dose_units: number;
}

export interface MealTracesTable {
  meal_entry_id: string;
  model: string;
  duration_ms: number;
  raw_response: string;
  searches: Json<unknown[]>;
}

export interface TimelineView {
  id: string;
  kind: "meal" | "fast_insulin" | "slow_insulin" | "glucose_reading";
  occurred_at: Date;
  occurred_tz: string;
  occurred_local: Date;
}

export interface FoodVocabularyTable {
  description_key: string;
  source: string;
  external_id: string;
  description: string;
  usda_description: string;
  last_weight_g: number;
  use_count: number;
  last_used_at: Timestamp;
}

export interface AnthropicApiKeyTable {
  singleton: boolean;
  salt: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  ciphertext: Buffer;
}

export interface Database {
  insulin_products: InsulinProductsTable;
  food_sources: FoodSourcesTable;
  catalog_releases: CatalogReleasesTable;
  settings: SettingsTable;
  meal_windows: MealWindowsTable;
  profiles: ProfilesTable;
  profile_window_ratios: ProfileWindowRatiosTable;
  ratio_versions: RatioVersionsTable;
  glucose_entries: GlucoseEntriesTable;
  slow_insulin_entries: SlowInsulinEntriesTable;
  fast_insulin_entries: FastInsulinEntriesTable;
  meal_entries: MealEntriesTable;
  meal_items: MealItemsTable;
  meal_corrections: MealCorrectionsTable;
  meal_fat_protein_adjustments: MealFatProteinAdjustmentsTable;
  meal_traces: MealTracesTable;
  timeline: TimelineView;
  food_vocabulary: FoodVocabularyTable;
  anthropic_api_key: AnthropicApiKeyTable;
}
