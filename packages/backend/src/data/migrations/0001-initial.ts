import { type Kysely, sql } from "kysely";

export const schema = String.raw`
CREATE TYPE glucose_unit AS ENUM ('mg/dL', 'mmol/L');
CREATE TYPE ratio_format AS ENUM ('grams_per_unit', 'units_per_10g');
CREATE TYPE insulin_action AS ENUM ('bolus', 'basal');
CREATE TYPE entry_kind AS ENUM ('meal', 'fast_insulin', 'slow_insulin', 'glucose_reading');
CREATE TYPE confidence AS ENUM ('high', 'medium', 'low');
CREATE TYPE adjustment_mode AS ENUM ('percent', 'per_window');
CREATE TYPE fat_protein_trigger AS ENUM ('high_fat', 'fat_and_protein', 'energy_ratio');

CREATE TABLE insulin_products (
  id text PRIMARY KEY CHECK (id <> ''),
  action insulin_action NOT NULL,
  UNIQUE (id, action)
);
INSERT INTO insulin_products (id, action) VALUES
  ('novorapid', 'bolus'),
  ('lantus', 'basal'), ('levemir', 'basal'), ('tresiba', 'basal');

CREATE TABLE food_sources (
  id text PRIMARY KEY CHECK (id <> ''),
  catalog boolean NOT NULL,
  estimate boolean NOT NULL,
  UNIQUE (id, catalog)
);
INSERT INTO food_sources (id, catalog, estimate) VALUES
  ('usda_sr_legacy', true, false), ('usda_foundation', true, false),
  ('usda_survey', true, false), ('curated', true, false),
  ('usda_unspecified', false, false), ('sugirs', false, false),
  ('llm_estimate', false, true), ('user', false, false), ('unknown', false, false);

CREATE TABLE settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  language text NOT NULL CHECK (language IN ('en', 'es')),
  glucose_unit glucose_unit NOT NULL,  -- display preference only
  ratio_format ratio_format NOT NULL,
  pen_increment_units double precision NOT NULL CHECK (pen_increment_units > 0),
  target_glucose_mg_dl double precision NOT NULL CHECK (target_glucose_mg_dl > 0),
  glucose_drop_mg_dl_per_unit double precision CHECK (glucose_drop_mg_dl_per_unit > 0),
  fat_protein_multiplier double precision NOT NULL CHECK (fat_protein_multiplier BETWEEN 0 AND 1),
  bolus_insulin text,
  bolus_action insulin_action NOT NULL DEFAULT 'bolus' CHECK (bolus_action = 'bolus'),
  basal_insulin text,
  basal_action insulin_action NOT NULL DEFAULT 'basal' CHECK (basal_action = 'basal'),
  insulin_action_minutes smallint CHECK (insulin_action_minutes > 0),
  cycle_tracking_enabled boolean NOT NULL,
  cycle_length_days smallint NOT NULL CHECK (cycle_length_days > 0),
  last_period_start date,
  active_profile_id uuid NOT NULL
);

CREATE TABLE meal_windows (
  id uuid PRIMARY KEY,
  position smallint NOT NULL UNIQUE DEFERRABLE INITIALLY IMMEDIATE CHECK (position >= 0),
  name text NOT NULL UNIQUE CHECK (name <> ''),
  start_hour smallint NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
  end_hour smallint NOT NULL CHECK (end_hour BETWEEN 0 AND 24),
  carbs_g_per_unit double precision NOT NULL CHECK (carbs_g_per_unit > 0)
);

CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  position smallint NOT NULL UNIQUE DEFERRABLE INITIALLY IMMEDIATE CHECK (position >= 0),
  name text CHECK (name <> ''),
  icon text NOT NULL CHECK (icon <> ''),
  adjustment_mode adjustment_mode NOT NULL,
  percent_adjustment double precision CHECK (percent_adjustment > -100),
  CHECK ((adjustment_mode = 'percent') = (percent_adjustment IS NOT NULL)),
  UNIQUE (id, adjustment_mode)
);

CREATE TABLE profile_window_ratios (
  profile_id uuid NOT NULL,
  adjustment_mode adjustment_mode NOT NULL DEFAULT 'per_window' CHECK (adjustment_mode = 'per_window'),
  window_id uuid NOT NULL REFERENCES meal_windows (id) ON DELETE CASCADE,
  carbs_g_per_unit double precision NOT NULL CHECK (carbs_g_per_unit > 0),
  PRIMARY KEY (profile_id, window_id),
  FOREIGN KEY (profile_id, adjustment_mode) REFERENCES profiles (id, adjustment_mode) ON DELETE CASCADE
);

ALTER TABLE settings
  ADD FOREIGN KEY (bolus_insulin, bolus_action) REFERENCES insulin_products (id, action),
  ADD FOREIGN KEY (basal_insulin, basal_action) REFERENCES insulin_products (id, action),
  ADD FOREIGN KEY (active_profile_id) REFERENCES profiles (id) ON DELETE RESTRICT;

CREATE TABLE ratio_versions (
  id uuid PRIMARY KEY,
  window_name text NOT NULL CHECK (window_name <> ''),
  window_start_hour smallint NOT NULL CHECK (window_start_hour BETWEEN 0 AND 23),
  window_end_hour smallint NOT NULL CHECK (window_end_hour BETWEEN 0 AND 24),
  profile_id uuid,
  profile_name text CHECK (profile_name <> ''),
  adjustment_mode adjustment_mode,
  percent_adjustment double precision CHECK (percent_adjustment > -100),
  carbs_g_per_unit double precision NOT NULL CHECK (carbs_g_per_unit > 0),
  first_used_at timestamptz NOT NULL,
  CHECK ((profile_id IS NULL) = (adjustment_mode IS NULL)),
  CHECK (profile_id IS NOT NULL OR profile_name IS NULL),
  CHECK (coalesce(adjustment_mode = 'percent', false) = (percent_adjustment IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (window_name, window_start_hour, window_end_hour, profile_id,
    profile_name, adjustment_mode, percent_adjustment, carbs_g_per_unit)
);

CREATE TABLE catalog_releases (
  id smallint PRIMARY KEY,
  label text NOT NULL UNIQUE CHECK (label <> ''),
  imported_at timestamptz NOT NULL
);

CREATE TABLE meal_entries (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  occurred_tz text NOT NULL CHECK (occurred_tz <> ''),
  input_text text NOT NULL,
  input_language text NOT NULL CHECK (input_language IN ('en', 'es')),
  ratio_version_id uuid NOT NULL REFERENCES ratio_versions (id) ON DELETE RESTRICT,
  total_carbs_g double precision NOT NULL,
  carb_dose_units double precision NOT NULL CHECK (carb_dose_units >= 0),
  total_dose_units double precision NOT NULL CHECK (total_dose_units >= 0),
  catalog_release smallint NOT NULL REFERENCES catalog_releases (id)
);
CREATE INDEX meal_entries_newest_first ON meal_entries (occurred_at DESC, id DESC);

CREATE TABLE meal_items (
  meal_entry_id uuid NOT NULL REFERENCES meal_entries (id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position >= 0),
  description text NOT NULL,
  weight_g double precision NOT NULL CHECK (weight_g >= 0),
  assumed_cooked boolean NOT NULL,
  confidence confidence NOT NULL,
  source text NOT NULL REFERENCES food_sources (id),
  carbs_per_100g double precision NOT NULL,
  carbs_g double precision NOT NULL,
  fat_per_100g double precision NOT NULL CHECK (fat_per_100g >= 0),
  fat_g double precision NOT NULL CHECK (fat_g >= 0),
  protein_per_100g double precision NOT NULL CHECK (protein_per_100g >= 0),
  protein_g double precision NOT NULL CHECK (protein_g >= 0),
  glycemic_index smallint CHECK (glycemic_index >= 0),
  gi_estimated boolean NOT NULL CHECK (NOT gi_estimated OR glycemic_index IS NOT NULL),
  notes text CHECK (notes <> ''),
  warning text CHECK (warning <> ''),
  external_id text CHECK (external_id <> ''),
  food_snapshot jsonb,
  CHECK ((external_id IS NULL) = (food_snapshot IS NULL)),
  PRIMARY KEY (meal_entry_id, position)
);

CREATE TABLE meal_corrections (
  meal_entry_id uuid PRIMARY KEY REFERENCES meal_entries (id) ON DELETE CASCADE,
  current_glucose_mg_dl double precision NOT NULL CHECK (current_glucose_mg_dl > 0),
  target_glucose_mg_dl double precision NOT NULL CHECK (target_glucose_mg_dl > 0),
  glucose_drop_mg_dl_per_unit double precision NOT NULL CHECK (glucose_drop_mg_dl_per_unit > 0),
  correction_dose_units double precision NOT NULL,
  iob_units double precision NOT NULL CHECK (iob_units >= 0),
  iob_reduction_units double precision NOT NULL CHECK (iob_reduction_units >= 0)
);

CREATE TABLE meal_fat_protein_adjustments (
  meal_entry_id uuid PRIMARY KEY REFERENCES meal_entries (id) ON DELETE CASCADE,
  total_fat_g double precision NOT NULL CHECK (total_fat_g >= 0),
  total_protein_g double precision NOT NULL CHECK (total_protein_g >= 0),
  trigger fat_protein_trigger NOT NULL,
  multiplier double precision NOT NULL CHECK (multiplier > 0),
  adjustment_dose_units double precision NOT NULL CHECK (adjustment_dose_units >= 0)
);

CREATE TABLE meal_traces (
  meal_entry_id uuid PRIMARY KEY REFERENCES meal_entries (id) ON DELETE CASCADE,
  model text NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  raw_response text NOT NULL,
  searches jsonb NOT NULL
);

CREATE TABLE glucose_entries (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  occurred_tz text NOT NULL CHECK (occurred_tz <> ''),
  glucose_mg_dl double precision NOT NULL CHECK (glucose_mg_dl > 0)
);
CREATE INDEX glucose_entries_newest_first ON glucose_entries (occurred_at DESC, id DESC);

CREATE TABLE slow_insulin_entries (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  occurred_tz text NOT NULL CHECK (occurred_tz <> ''),
  insulin text NOT NULL,
  action insulin_action NOT NULL DEFAULT 'basal' CHECK (action = 'basal'),
  FOREIGN KEY (insulin, action) REFERENCES insulin_products (id, action),
  insulin_units double precision NOT NULL CHECK (insulin_units > 0)
);
CREATE INDEX slow_insulin_entries_newest_first ON slow_insulin_entries (occurred_at DESC, id DESC);

CREATE TABLE fast_insulin_entries (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  occurred_tz text NOT NULL CHECK (occurred_tz <> ''),
  insulin text NOT NULL,
  action insulin_action NOT NULL DEFAULT 'bolus' CHECK (action = 'bolus'),
  FOREIGN KEY (insulin, action) REFERENCES insulin_products (id, action),
  insulin_units double precision NOT NULL CHECK (insulin_units > 0),
  meal_entry_id uuid REFERENCES meal_entries (id) ON DELETE SET NULL
);
CREATE INDEX fast_insulin_entries_newest_first ON fast_insulin_entries (occurred_at DESC, id DESC);
CREATE INDEX fast_insulin_entries_meal ON fast_insulin_entries (meal_entry_id);

CREATE VIEW timeline AS
SELECT id, kind, occurred_at, occurred_tz,
       occurred_at AT TIME ZONE occurred_tz AS occurred_local
FROM (
            SELECT id, 'glucose_reading'::entry_kind AS kind, occurred_at, occurred_tz FROM glucose_entries
  UNION ALL SELECT id, 'slow_insulin'::entry_kind, occurred_at, occurred_tz FROM slow_insulin_entries
  UNION ALL SELECT id, 'fast_insulin'::entry_kind, occurred_at, occurred_tz FROM fast_insulin_entries
  UNION ALL SELECT id, 'meal'::entry_kind, occurred_at, occurred_tz FROM meal_entries
) AS entries;

CREATE TABLE food_vocabulary (
  description_key text NOT NULL CHECK (description_key = lower(description_key)),
  source text NOT NULL REFERENCES food_sources (id),
  external_id text NOT NULL CHECK (external_id <> ''),
  description text NOT NULL,
  usda_description text NOT NULL,
  last_weight_g double precision NOT NULL CHECK (last_weight_g > 0),
  use_count integer NOT NULL CHECK (use_count >= 1),
  last_used_at timestamptz NOT NULL,
  PRIMARY KEY (description_key, source, external_id)
);

CREATE TABLE anthropic_api_key (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  salt bytea NOT NULL CHECK (octet_length(salt) = 16),
  iv bytea NOT NULL CHECK (octet_length(iv) = 12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
  ciphertext bytea NOT NULL CHECK (octet_length(ciphertext) > 0)
);

INSERT INTO catalog_releases (id, label, imported_at)
  VALUES (0, 'before releases were recorded', now());
`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(schema).execute(db);
}
