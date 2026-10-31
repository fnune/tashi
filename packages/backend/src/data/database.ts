import type { Generated, Kysely, Transaction } from "kysely";

export const MAX_PARAMETERS_PER_STATEMENT = 100;

export type Instant = string;
export type Flag = 0 | 1;
type JsonText = string;

export interface InsulinProductsTable {
  id: string;
  action: "bolus" | "basal";
}

export interface FoodSourcesTable {
  id: string;
  catalog: Flag;
  estimate: Flag;
}

export interface CatalogReleasesTable {
  label: string;
}

export interface SettingsTable {
  singleton: 1;
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
  cycle_tracking_enabled: Flag;
  cycle_length_days: number;
  last_period_start: string | null;
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
  first_used_at: Instant;
}

export interface GlucoseEntriesTable {
  id: string;
  occurred_at: Instant;
  occurred_tz: string;
  glucose_mg_dl: number;
}

export interface SlowInsulinEntriesTable {
  id: string;
  occurred_at: Instant;
  occurred_tz: string;
  insulin: string;
  action: Generated<"basal">;
  insulin_units: number;
}

export interface FastInsulinEntriesTable {
  id: string;
  occurred_at: Instant;
  occurred_tz: string;
  insulin: string;
  action: Generated<"bolus">;
  insulin_units: number;
  meal_entry_id: string | null;
}

export interface MealEntriesTable {
  id: string;
  occurred_at: Instant;
  occurred_tz: string;
  input_text: string;
  input_language: "en" | "es";
  ratio_version_id: string;
  total_carbs_g: number;
  carb_dose_units: number;
  total_dose_units: number;
  catalog_release: string;
}

export interface MealItemsTable {
  meal_entry_id: string;
  position: number;
  description: string;
  weight_g: number;
  assumed_cooked: Flag;
  confidence: "high" | "medium" | "low";
  source: string;
  carbs_per_100g: number;
  carbs_g: number;
  fat_per_100g: number;
  fat_g: number;
  protein_per_100g: number;
  protein_g: number;
  glycemic_index: number | null;
  gi_estimated: Flag;
  notes: string | null;
  warning: string | null;
  external_id: string | null;
  food_snapshot: JsonText | null;
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
  searches: JsonText;
}

export interface TimelineView {
  id: string;
  kind: "meal" | "fast_insulin" | "slow_insulin" | "glucose_reading";
  occurred_at: Instant;
  occurred_tz: string;
}

export interface FoodVocabularyTable {
  description_key: string;
  source: string;
  external_id: string;
  description: string;
  catalog_name: string;
  last_weight_g: number;
  use_count: number;
  last_used_at: Instant;
}

export interface AnthropicApiKeyTable {
  singleton: 1;
  salt: Uint8Array;
  iv: Uint8Array;
  auth_tag: Uint8Array;
  ciphertext: Uint8Array;
}

export interface AccountsTable {
  id: string;
  name: string;
  name_key: string;
  role: "admin" | "member";
  created_at: Instant;
}

export interface SignInMethodsTable {
  id: string;
  account_id: string;
  kind: "password";
  created_at: Instant;
}

export interface PasswordMethodsTable {
  method_id: string;
  kind: Generated<"password">;
  salt: Uint8Array;
  iterations: number;
  verifier: Uint8Array;
  wrapped_data_key: Uint8Array;
}

export interface SessionsTable {
  token_hash: Uint8Array;
  account_id: string;
  stage: "second_factor" | "signed_in";
  created_at: Instant;
  expires_at: Instant;
  wrapped_data_key: Uint8Array;
}

export interface SignInFailuresTable {
  name_key: string;
  failures: number;
  last_failure_at: Instant;
}

export interface ModelUsageTable {
  id: Generated<number>;
  used_at: Instant;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
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
  accounts: AccountsTable;
  sign_in_methods: SignInMethodsTable;
  password_methods: PasswordMethodsTable;
  sessions: SessionsTable;
  sign_in_failures: SignInFailuresTable;
  model_usage: ModelUsageTable;
}

export type Db = Kysely<Database>;
export type Executor = Db | Transaction<Database>;
