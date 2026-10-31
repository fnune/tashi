import { type Kysely, sql } from "kysely";

export const schema = String.raw`
CREATE TABLE insulin_products (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  action TEXT NOT NULL CHECK (action IN ('bolus', 'basal')),
  UNIQUE (id, action)
) STRICT;
INSERT INTO insulin_products (id, action) VALUES
  ('novorapid', 'bolus'),
  ('lantus', 'basal'), ('levemir', 'basal'), ('tresiba', 'basal');

CREATE TABLE food_sources (
  id TEXT PRIMARY KEY CHECK (id <> ''),
  catalog INTEGER NOT NULL CHECK (catalog IN (0, 1)),
  estimate INTEGER NOT NULL CHECK (estimate IN (0, 1))
) STRICT;
INSERT INTO food_sources (id, catalog, estimate) VALUES
  ('usda_sr_legacy', 1, 0), ('usda_foundation', 1, 0),
  ('usda_survey', 1, 0), ('curated', 1, 0),
  ('usda_unspecified', 0, 0), ('sugirs', 0, 0),
  ('llm_estimate', 0, 1), ('user', 0, 0), ('unknown', 0, 0);

CREATE TABLE meal_windows (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT NOT NULL UNIQUE CHECK (name <> ''),
  start_hour INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour INTEGER NOT NULL CHECK (end_hour BETWEEN 0 AND 24),
  carbs_g_per_unit REAL NOT NULL CHECK (carbs_g_per_unit > 0)
) STRICT;

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  name TEXT CHECK (name <> ''),
  icon TEXT NOT NULL CHECK (icon <> ''),
  adjustment_mode TEXT NOT NULL CHECK (adjustment_mode IN ('percent', 'per_window')),
  percent_adjustment REAL CHECK (percent_adjustment > -100),
  CHECK ((adjustment_mode = 'percent') = (percent_adjustment IS NOT NULL)),
  UNIQUE (id, adjustment_mode)
) STRICT;

CREATE TABLE profile_window_ratios (
  profile_id TEXT NOT NULL,
  adjustment_mode TEXT NOT NULL DEFAULT 'per_window' CHECK (adjustment_mode = 'per_window'),
  window_id TEXT NOT NULL REFERENCES meal_windows (id) ON DELETE CASCADE,
  carbs_g_per_unit REAL NOT NULL CHECK (carbs_g_per_unit > 0),
  PRIMARY KEY (profile_id, window_id),
  FOREIGN KEY (profile_id, adjustment_mode) REFERENCES profiles (id, adjustment_mode) ON DELETE CASCADE
) STRICT;

CREATE TABLE settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  language TEXT NOT NULL CHECK (language IN ('en', 'es')),
  glucose_unit TEXT NOT NULL CHECK (glucose_unit IN ('mg/dL', 'mmol/L')),
  ratio_format TEXT NOT NULL CHECK (ratio_format IN ('grams_per_unit', 'units_per_10g')),
  pen_increment_units REAL NOT NULL CHECK (pen_increment_units > 0),
  target_glucose_mg_dl REAL NOT NULL CHECK (target_glucose_mg_dl > 0),
  glucose_drop_mg_dl_per_unit REAL CHECK (glucose_drop_mg_dl_per_unit > 0),
  fat_protein_multiplier REAL NOT NULL CHECK (fat_protein_multiplier BETWEEN 0 AND 1),
  bolus_insulin TEXT,
  bolus_action TEXT NOT NULL DEFAULT 'bolus' CHECK (bolus_action = 'bolus'),
  basal_insulin TEXT,
  basal_action TEXT NOT NULL DEFAULT 'basal' CHECK (basal_action = 'basal'),
  insulin_action_minutes INTEGER CHECK (insulin_action_minutes > 0),
  cycle_tracking_enabled INTEGER NOT NULL CHECK (cycle_tracking_enabled IN (0, 1)),
  cycle_length_days INTEGER NOT NULL CHECK (cycle_length_days > 0),
  last_period_start TEXT CHECK (last_period_start IS date(last_period_start)),
  active_profile_id TEXT NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  FOREIGN KEY (bolus_insulin, bolus_action) REFERENCES insulin_products (id, action),
  FOREIGN KEY (basal_insulin, basal_action) REFERENCES insulin_products (id, action)
) STRICT;

CREATE TABLE ratio_versions (
  id TEXT PRIMARY KEY,
  window_name TEXT NOT NULL CHECK (window_name <> ''),
  window_start_hour INTEGER NOT NULL CHECK (window_start_hour BETWEEN 0 AND 23),
  window_end_hour INTEGER NOT NULL CHECK (window_end_hour BETWEEN 0 AND 24),
  profile_id TEXT,
  profile_name TEXT CHECK (profile_name <> ''),
  adjustment_mode TEXT CHECK (adjustment_mode IN ('percent', 'per_window')),
  percent_adjustment REAL CHECK (percent_adjustment > -100),
  carbs_g_per_unit REAL NOT NULL CHECK (carbs_g_per_unit > 0),
  first_used_at TEXT NOT NULL CHECK (first_used_at IS strftime('%Y-%m-%dT%H:%M:%fZ', first_used_at)),
  CHECK ((profile_id IS NULL) = (adjustment_mode IS NULL)),
  CHECK (profile_id IS NOT NULL OR profile_name IS NULL),
  CHECK (ifnull(adjustment_mode = 'percent', 0) = (percent_adjustment IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX ratio_versions_once ON ratio_versions (window_name, window_start_hour,
  window_end_hour, ifnull(profile_id, ''), ifnull(profile_name, ''), ifnull(adjustment_mode, ''),
  ifnull(percent_adjustment, -100), carbs_g_per_unit);

CREATE TABLE catalog_releases (
  label TEXT PRIMARY KEY CHECK (label <> '')
) STRICT;

CREATE TABLE glucose_entries (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL CHECK (occurred_at IS strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at)),
  occurred_tz TEXT NOT NULL CHECK (occurred_tz <> ''),
  glucose_mg_dl REAL NOT NULL CHECK (glucose_mg_dl > 0)
) STRICT;
CREATE INDEX glucose_entries_newest_first ON glucose_entries (occurred_at DESC, id DESC);

CREATE TABLE slow_insulin_entries (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL CHECK (occurred_at IS strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at)),
  occurred_tz TEXT NOT NULL CHECK (occurred_tz <> ''),
  insulin TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'basal' CHECK (action = 'basal'),
  insulin_units REAL NOT NULL CHECK (insulin_units > 0),
  FOREIGN KEY (insulin, action) REFERENCES insulin_products (id, action)
) STRICT;
CREATE INDEX slow_insulin_entries_newest_first ON slow_insulin_entries (occurred_at DESC, id DESC);

CREATE TABLE meal_entries (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL CHECK (occurred_at IS strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at)),
  occurred_tz TEXT NOT NULL CHECK (occurred_tz <> ''),
  input_text TEXT NOT NULL,
  input_language TEXT NOT NULL CHECK (input_language IN ('en', 'es')),
  ratio_version_id TEXT NOT NULL REFERENCES ratio_versions (id) ON DELETE RESTRICT,
  total_carbs_g REAL NOT NULL,
  carb_dose_units REAL NOT NULL CHECK (carb_dose_units >= 0),
  total_dose_units REAL NOT NULL CHECK (total_dose_units >= 0),
  catalog_release TEXT NOT NULL REFERENCES catalog_releases (label)
) STRICT;
CREATE INDEX meal_entries_newest_first ON meal_entries (occurred_at DESC, id DESC);

CREATE TABLE meal_items (
  meal_entry_id TEXT NOT NULL REFERENCES meal_entries (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  description TEXT NOT NULL,
  weight_g REAL NOT NULL CHECK (weight_g >= 0),
  assumed_cooked INTEGER NOT NULL CHECK (assumed_cooked IN (0, 1)),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  source TEXT NOT NULL REFERENCES food_sources (id),
  carbs_per_100g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_per_100g REAL NOT NULL CHECK (fat_per_100g >= 0),
  fat_g REAL NOT NULL CHECK (fat_g >= 0),
  protein_per_100g REAL NOT NULL CHECK (protein_per_100g >= 0),
  protein_g REAL NOT NULL CHECK (protein_g >= 0),
  glycemic_index INTEGER CHECK (glycemic_index >= 0),
  gi_estimated INTEGER NOT NULL CHECK (gi_estimated IN (0, 1) AND (NOT gi_estimated OR glycemic_index IS NOT NULL)),
  notes TEXT CHECK (notes <> ''),
  warning TEXT CHECK (warning <> ''),
  external_id TEXT CHECK (external_id <> ''),
  food_snapshot TEXT CHECK (json_valid(food_snapshot)),
  CHECK ((external_id IS NULL) = (food_snapshot IS NULL)),
  PRIMARY KEY (meal_entry_id, position)
) STRICT;

CREATE TABLE meal_corrections (
  meal_entry_id TEXT PRIMARY KEY REFERENCES meal_entries (id) ON DELETE CASCADE,
  current_glucose_mg_dl REAL NOT NULL CHECK (current_glucose_mg_dl > 0),
  target_glucose_mg_dl REAL NOT NULL CHECK (target_glucose_mg_dl > 0),
  glucose_drop_mg_dl_per_unit REAL NOT NULL CHECK (glucose_drop_mg_dl_per_unit > 0),
  correction_dose_units REAL NOT NULL,
  iob_units REAL NOT NULL CHECK (iob_units >= 0),
  iob_reduction_units REAL NOT NULL CHECK (iob_reduction_units >= 0)
) STRICT;

CREATE TABLE meal_fat_protein_adjustments (
  meal_entry_id TEXT PRIMARY KEY REFERENCES meal_entries (id) ON DELETE CASCADE,
  total_fat_g REAL NOT NULL CHECK (total_fat_g >= 0),
  total_protein_g REAL NOT NULL CHECK (total_protein_g >= 0),
  trigger TEXT NOT NULL CHECK (trigger IN ('high_fat', 'fat_and_protein', 'energy_ratio')),
  multiplier REAL NOT NULL CHECK (multiplier > 0),
  adjustment_dose_units REAL NOT NULL CHECK (adjustment_dose_units >= 0)
) STRICT;

CREATE TABLE meal_traces (
  meal_entry_id TEXT PRIMARY KEY REFERENCES meal_entries (id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  raw_response TEXT NOT NULL,
  searches TEXT NOT NULL CHECK (json_valid(searches))
) STRICT;

CREATE TABLE fast_insulin_entries (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL CHECK (occurred_at IS strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at)),
  occurred_tz TEXT NOT NULL CHECK (occurred_tz <> ''),
  insulin TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'bolus' CHECK (action = 'bolus'),
  insulin_units REAL NOT NULL CHECK (insulin_units > 0),
  meal_entry_id TEXT REFERENCES meal_entries (id) ON DELETE SET NULL,
  FOREIGN KEY (insulin, action) REFERENCES insulin_products (id, action)
) STRICT;
CREATE INDEX fast_insulin_entries_newest_first ON fast_insulin_entries (occurred_at DESC, id DESC);
CREATE INDEX fast_insulin_entries_meal ON fast_insulin_entries (meal_entry_id);

CREATE VIEW timeline AS
            SELECT id, 'glucose_reading' AS kind, occurred_at, occurred_tz FROM glucose_entries
  UNION ALL SELECT id, 'slow_insulin', occurred_at, occurred_tz FROM slow_insulin_entries
  UNION ALL SELECT id, 'fast_insulin', occurred_at, occurred_tz FROM fast_insulin_entries
  UNION ALL SELECT id, 'meal', occurred_at, occurred_tz FROM meal_entries;

CREATE TABLE food_vocabulary (
  description_key TEXT NOT NULL CHECK (description_key = lower(description_key)),
  source TEXT NOT NULL REFERENCES food_sources (id),
  external_id TEXT NOT NULL CHECK (external_id <> ''),
  description TEXT NOT NULL,
  catalog_name TEXT NOT NULL CHECK (catalog_name <> ''),
  last_weight_g REAL NOT NULL CHECK (last_weight_g > 0),
  use_count INTEGER NOT NULL CHECK (use_count >= 1),
  last_used_at TEXT NOT NULL CHECK (last_used_at IS strftime('%Y-%m-%dT%H:%M:%fZ', last_used_at)),
  PRIMARY KEY (description_key, source, external_id)
) STRICT;
`;

export const statementsOf = (script: string) =>
  `${script}\n`
    .split(/;\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");

export const statements = statementsOf(schema);

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of statements) {
    await sql.raw(statement).execute(db);
  }
}
