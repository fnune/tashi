# Tashi database schema

Written 2026-10-27.

This is the Postgres schema Tashi should have, written before any code: it replaces the first-cut tables, which only mirror the JSON files, and nothing deployed has run those. The migration is the source of truth for the DDL; this document is the reasoning behind it. The SQL blocks are in reading order, so some refer to tables defined further down; the migration creates them in dependency order.

**Important: every glucose value is stored in one canonical unit, mg/dL, in every table.** Changing the display unit never rewrites stored data. `settings.glucose_unit` is only a display preference, and conversion happens at the edges of the code: parsing input and formatting output. Columns say so in their names (`_mg_dl`). mg/dL is what bilbo's data already uses, so the migration converts nothing. Conversion uses one constant in code, 1 mmol/L = 18.016 mg/dL (glucose, 180.16 g/mol); values are doubles, so mmol/L entries round-trip once rounded for display.

## What it aims for

- No nullable column unless "not set" is a real state of the world. Each remaining null is listed with its meaning.
- Optional groups of fields become tables whose rows exist only when the group applies.
- A fact that varies by type lives in a table for that type; the timeline is a view over those tables, not a stored table.
- Names say what the value is and its unit: `_g` grams, `_units` insulin units, \_mg\_dl glucose in mg/dL, `_minutes`, `_at` instants, `_hour` local hour of the day.
- The database refuses what the app would also refuse, but ranges the app chooses (plausible glucose, insulin action time, cycle length) live only in the zod schemas, so there are not two copies to drift.
- Closed sets from the code are Postgres enum types. Identifiers are `uuid`, instants `timestamptz`, fractions `double precision` (the app is JavaScript; `numeric` comes back as a string).
- Reference data the app ships (the foods catalog) is imported as entries and facts, each with its source and release, and a meal records the entry and release it used. The catalog tables arrive in a second phase; see Foods catalog.

## Where today's data model is ambiguous

- `recommended_dose` on a meal is only the carb dose. The dose to inject is the fat and protein total, else the correction total, else `recommended_dose`, and nothing stores it directly. The schema stores `carb_dose_units` and `total_dose_units`.
- `meal_window.ratio` on a meal is the ratio after the active profile was applied, but looks like the window's own. It becomes a row in ratio\_versions, which the meal references; the ratio is its `carbs_g_per_unit`.
- `correction.current_blood_sugar`, `target_blood_sugar` and `correction_factor` have no unit; they follow whatever unit was set at the time. The schema stores them in mg/dL, the canonical unit.
- `ratio` is always grams of fibre-excluded carbohydrate per unit of insulin; `ratio_format` only changes display. The name says so.
- `language` on a meal is the language detected in what was typed, not the interface language: `input_language`.
- `default_weight_g` in the vocabulary is the weight of the latest use, not a chosen default: `last_weight_g`.
- `units` on an insulin entry reads like a measurement unit: `insulin_units`.
- `profile.name` is the empty string for built-in profiles, meaning "use the translated name": it becomes a null with that stated meaning. `profile.emoji` holds an emoji or an icon key: `icon`.
- `total_dose` and `profile` exist on the meal type but the meal log never writes them.
- 21 insulin entries have ids like `<uuid>-ins`, and 2 point at meals that no longer exist.

## Types and settings

Closed sets whose values each have their own code path are enum types, so the database and `@tashi/shared` agree on them. Insulin products are rows in `insulin_products`: registering one is an `INSERT` in a migration, and an `(id, action)` foreign key stops a basal column from holding a bolus product. `language` is text with a check, since it only grows when translations ship.

```sql
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
```

Settings are one row plus meal windows and profiles, saved together in one transaction. The repository interface still reads and writes a whole `Settings`.

```sql
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
```

- `target_glucose_mg_dl` and `glucose_drop_mg_dl_per_unit` (how far one insulin unit lowers glucose) are in mg/dL whatever `glucose_unit` says. Changing the display unit changes no stored number.
- A profile adjusts by a percentage or sets a ratio per meal window. The composite foreign key stops a percentage profile from owning window ratios, and the check stops it from lacking its percentage.
- Windows and profiles keep the order the user arranged them in (`position`), because the interface shows them in that order.
- A window ratio references its window by id; renaming a window changes one row, and names are unique.
- "The Normal profile cannot be removed" stays a rule of the application.

A meal does not copy the ratio it used; it references a row in `ratio_versions`, the effective ratio for one window under one profile. Settings keep being edited in place; only the effective ratio is versioned.

```sql
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
```

- Logging a meal inserts its version if it is new and reuses the existing row otherwise (`INSERT … ON CONFLICT DO NOTHING`, then select). Rows are never updated or deleted. The effective ratio is still computed by the code.
- `profile_id` has no foreign key: a profile can be removed, and its versions must stay. `profile_name` null means the built-in, translated name, as in `profiles`.
- The profile columns are null together for meals logged before versions existed; the log never recorded the profile.
- This gives the ratio history and the profile active at each meal. `UNIQUE NULLS NOT DISTINCT` needs Postgres 15 or later.

## Timeline

Every entry has an id and a time; what else it has depends on the kind, so each kind has its own table carrying both. The timeline is the view `timeline`, a `UNION ALL` of the four tables; each has an `(occurred_at, id)` index, so newest-first reads and `listSince` merge sorted indexes. Ids are uuids, so they do not collide across tables, but nothing in the database enforces that; deleting or editing an entry needs its kind, or the repository tries each table.

```sql
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
```

- `occurred_at` is when the thing happened, as an instant; `occurred_tz` is the IANA zone the user was in (e.g. `Europe/Madrid`), taken from the browser when the entry is logged. A meal logged with a pre-bolus wait is dated in the future of the moment of logging. When an entry was recorded is not stored; nothing uses it.
- Instant and zone are one value in code, never two. The repositories read both columns into a single zoned date-time (`Temporal.ZonedDateTime`, or a small `{ instant, timeZone }` type), and domain types have no bare `occurred_at`. Code that needs a local hour asks that value, so forgetting the zone is a type error, not a silent bug. SQL that needs local time reads `occurred_local` from the `timeline` view. zod validates the zone name against the IANA list the runtime knows.
- `fast_insulin_entries.meal_entry_id` is null for a dose not tied to a meal (a correction or a manual entry): 54 of 180 in today's data. Deleting a meal leaves its insulin entry, because the injection happened.
- `fast_insulin_entries` is created after `meal_entries` in the real migration; the order here follows the topic, not the dependency.

## Meals

A meal is a record of what was calculated and logged. It is never recalculated, and editing a meal can change only its time. Totals and per-item values are stored as calculated, so the stored dose is the one the user saw.

```sql
CREATE TABLE meal_entries (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  occurred_tz text NOT NULL CHECK (occurred_tz <> ''),
  input_text text NOT NULL,
  input_language text NOT NULL CHECK (input_language IN ('en', 'es')),
  ratio_version_id uuid NOT NULL REFERENCES ratio_versions (id) ON DELETE RESTRICT,
  total_carbs_g double precision NOT NULL CHECK (total_carbs_g >= 0),
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
  carbs_per_100g double precision NOT NULL CHECK (carbs_per_100g >= 0),
  carbs_g double precision NOT NULL CHECK (carbs_g >= 0),
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
```

- `carb_dose_units` is the carbohydrate dose rounded to the pen increment. The other parts are `correction_dose_units`, `iob_reduction_units` and `adjustment_dose_units`; the running totals after each step are not stored. `total_dose_units` is what was recommended in all, stored as the user saw it, and a test checks it against the parts with the code's clamping and rounding.
- A row in `meal_corrections` means a glucose reading was entered for that meal (the correction dose is negative below target). A row in `meal_fat_protein_adjustments` means the fat and protein threshold was met. A row in `meal_traces` means the parser recorded how it got its answer.
- `(source, external_id)` names the catalog entry the item was calculated with, and `catalog_release` on the meal says which release of the catalog it was. `external_id` is null when the item had no catalog entry. While the catalog tables do not exist (phase 1 of Foods catalog), `food_snapshot` keeps the entry's figures as they were, so the explainer can still show fibre and sugar. It is transitional: phase 2 adds the foreign key to `catalog_entries` and drops the column.
- `source` says where the figures of an item came from, and the source row says whether they are an estimate; there is no separate flag. The label the interface shows for a source is a translation keyed by its id, not a column. `notes` and `warning` are free text from the parser: absent is null, never an empty string.
- `searches` is the parser's list of queries and what each returned: debugging material, read back whole.

## Foods catalog

The catalog the app ships is the reference data behind every meal. Its model follows how the established food databases do it. Each row below names a source and what was taken from it.

| Source                                                                                                                                                                                                                                           | What it does                                                                                                                                                                                                                                                                                                                       | Taken                                                                                                                                                  | Left out                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [USDA FoodData Central](https://fdc.nal.usda.gov/download-datasets) (the CSV downloads, kept in this repository under `data/usda`)                                                                                                               | `food` is an identity with a description, a category and a publication date. `food_nutrient` is one row per food and nutrient, per 100 g, with a derivation and a number of data points. `nutrient` is a registry that holds the unit. `food_portion` allows many portions per food, each with a gram weight                       | Nutrients as rows against a registry. Many servings per entry. A variety is its own entry: SR Legacy has 17 "Apples, …" entries and Foundation 14 more | Derivation, data points, minimum, maximum and median. The 77,590 sample and sub-sample rows behind the 436 Foundation foods |
| [Open Food Facts](https://blog.openfoodfacts.org/?p=7701)                                                                                                                                                                                        | Nutrition data kept as separate sets per source (packaging, manufacturer, open databases such as USDA, estimates from ingredients), with an aggregate that records which source each nutrient came from. [Taxonomies](https://blog.openfoodfacts.org/en/news/on-taxonomies) of categories and ingredients carry names per language | Every fact names its source. A small curated layer of foods with names per language                                                                    | Aggregating competing sets. A full taxonomy, which is far larger than Tashi needs                                           |
| [EuroFIR and INFOODS](https://www.eurofir.org/?p=254) ([component nomenclature](https://www.fao.org/fileadmin/templates/food_composition/documents/Presentations/Food_Composition_-_Component_nomenclature.pdf), [LanguaL](https://langual.org)) | Nutrient components have standard identifiers. Values are documented with sampling, analytical method, aggregation and year. Foods are classified by facets                                                                                                                                                                        | A registry of nutrients with stable codes                                                                                                              | Per-value method documentation. Facet classification                                                                        |

### Two kinds of thing

- A **catalog entry** is what a source defines and measured: "Apples, raw, with skin". It is identified by `(source, external_id)`. Nutrients and servings belong to an entry, because they were measured on that exact thing. Entries of different varieties stay separate, as in USDA.
- A **food** is our own concept: "apple". It is sparse (78 today against 13,670 entries) and curated. Facts about the concept rather than one measured sample belong to it: names per language, the glycemic index (SUGiRS lists "apple", not a USDA sample) and the cooking multiplier. Entries are linked to a food; most entries have none, and the parser can still pick them.

Today's `curated` table is this second layer, attached to one chosen entry by a join. As links it can be corrected: the row for `tortilla_corn` currently joins to a breakfast cereal.

### Two phases

1. **With the first migration.** `food_sources` and `catalog_releases` exist. Meal items and the vocabulary hold `source` and `external_id` as plain columns, the meal holds its `catalog_release`, and items keep the transitional `food_snapshot`. Runtime search and lookups stay on the bundled catalog. This is what moving off the JSON files needs.
2. **Later, as its own migration.** The catalog is imported into the tables below, the plain columns become foreign keys, `food_snapshot` is dropped, and search moves to Postgres.

```sql
CREATE TABLE catalog_releases (
  id smallint PRIMARY KEY,
  label text NOT NULL UNIQUE CHECK (label <> ''),
  imported_at timestamptz NOT NULL
);
```

Phase 2:

```sql
CREATE TABLE nutrients (
  id text PRIMARY KEY CHECK (id <> ''),
  name text NOT NULL CHECK (name <> ''),
  unit text NOT NULL CHECK (unit IN ('g', 'mg', 'ug', 'kcal'))
);
INSERT INTO nutrients (id, name, unit) VALUES
  ('carbohydrate', 'Carbohydrate, by difference', 'g'), ('fibre', 'Fibre, total dietary', 'g'),
  ('sugars', 'Sugars, total', 'g'), ('fat', 'Total fat', 'g'), ('protein', 'Protein', 'g');

CREATE TABLE catalog_entries (
  source text NOT NULL,
  source_is_catalog boolean NOT NULL DEFAULT true CHECK (source_is_catalog),
  external_id text NOT NULL CHECK (external_id <> ''),
  name text NOT NULL CHECK (name <> ''),
  category text CHECK (category <> ''),
  published_on date,
  FOREIGN KEY (source, source_is_catalog) REFERENCES food_sources (id, catalog),
  PRIMARY KEY (source, external_id)
);

CREATE TABLE entry_nutrients (
  source text NOT NULL,
  external_id text NOT NULL,
  nutrient_id text NOT NULL REFERENCES nutrients (id),
  amount_per_100g double precision NOT NULL CHECK (amount_per_100g >= 0),
  from_release smallint NOT NULL REFERENCES catalog_releases (id),
  to_release smallint REFERENCES catalog_releases (id),
  CHECK (to_release IS NULL OR to_release > from_release),
  FOREIGN KEY (source, external_id) REFERENCES catalog_entries (source, external_id),
  PRIMARY KEY (source, external_id, nutrient_id, from_release)
);
CREATE UNIQUE INDEX entry_nutrients_current ON entry_nutrients (source, external_id, nutrient_id) WHERE to_release IS NULL;

CREATE TABLE entry_servings (
  source text NOT NULL,
  external_id text NOT NULL,
  position smallint NOT NULL CHECK (position >= 0),
  description text NOT NULL CHECK (description <> ''),
  grams double precision NOT NULL CHECK (grams > 0),
  from_release smallint NOT NULL REFERENCES catalog_releases (id),
  to_release smallint REFERENCES catalog_releases (id),
  CHECK (to_release IS NULL OR to_release > from_release),
  FOREIGN KEY (source, external_id) REFERENCES catalog_entries (source, external_id),
  PRIMARY KEY (source, external_id, position, from_release)
);

CREATE TABLE foods (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug <> '')
);

CREATE TABLE food_entries (
  food_id uuid NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  source text NOT NULL,
  external_id text NOT NULL,
  FOREIGN KEY (source, external_id) REFERENCES catalog_entries (source, external_id),
  PRIMARY KEY (source, external_id)
);

CREATE TABLE food_names (
  food_id uuid NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  language text NOT NULL CHECK (language IN ('en', 'es')),
  name text NOT NULL CHECK (name <> ''),
  PRIMARY KEY (food_id, language)
);

CREATE TABLE food_glycemic_indexes (
  food_id uuid NOT NULL REFERENCES foods (id) ON DELETE CASCADE,
  fact_source text NOT NULL REFERENCES food_sources (id),
  glycemic_index smallint NOT NULL CHECK (glycemic_index >= 0),
  from_release smallint NOT NULL REFERENCES catalog_releases (id),
  to_release smallint REFERENCES catalog_releases (id),
  CHECK (to_release IS NULL OR to_release > from_release),
  PRIMARY KEY (food_id, fact_source, from_release)
);

CREATE TABLE food_cooking_factors (
  food_id uuid PRIMARY KEY REFERENCES foods (id) ON DELETE CASCADE,
  multiplier double precision NOT NULL CHECK (multiplier > 0),
  fact_source text NOT NULL REFERENCES food_sources (id)
);

ALTER TABLE meal_items
  ADD FOREIGN KEY (source, external_id) REFERENCES catalog_entries (source, external_id),
  DROP COLUMN food_snapshot;
ALTER TABLE food_vocabulary
  ADD FOREIGN KEY (source, external_id) REFERENCES catalog_entries (source, external_id);
```

- **Nutrients are rows.** A nutrient that was not measured has no row, which is the honest way to say "unknown". Net carbohydrate is never stored: it is carbohydrate minus fibre, worked out in code. The import maps USDA's ids to ours (carbohydrate 1005, fibre 1079, sugars 1063 and then 2000, fat 1004, protein 1003; the survey rows carry the old nutrient numbers 205, 291, 269, 204 and 203 in the same column).
- **Unknown is not zero.** The current build treats missing fibre as 0 when it computes net carbohydrate, and 208 Foundation foods and 562 SR Legacy foods have none. Sixty Foundation foods have no carbohydrate at all. The code needs an explicit rule for a missing nutrient (for instance: without fibre, use carbohydrate and say so), decided before phase 2.
- **Measured figures are never rewritten.** Nutrients, servings and glycemic indexes carry a release range: a fact applies from `from_release` up to, not including, `to_release`, which is null while it is current. A corrected figure closes one row and adds another. The facts a meal used are those valid at its `catalog_release`. Hand-curated claims (names, cooking multipliers) are corrected in place, and their `fact_source` is `curated`.
- **Sources of facts.** The glycemic index cites `sugirs`, the Sydney glycemic index tables; the nutrient figures take the source of their entry. USDA's `data_type` becomes the entry's `source`.
- **Import.** A catalog update is a script run as a migration per release: it adds the release, adds entries, adds facts and closes the ones that changed. Rows are never otherwise updated or deleted. Only `foundation_food` rows are imported from Foundation, as the build does today.
- **Size.** About 13,670 entries and, at five nutrients each, roughly 70,000 nutrient rows for the first release: a few megabytes. A later release adds only what changed.
- **The columns were checked** against `data/foods.db` and the USDA CSVs on 2026-10-27. The glycemic index, Spanish names and cooking multipliers come from the `curated` table of the build.

## Vocabulary, API key, nulls and omissions

The vocabulary is what the user has logged before, offered back to the parser. The API key is sealed with AES-256-GCM before it reaches the database; bytes are stored as bytes, where the files used base64 text.

```sql
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
```

`description_key` is the description lower-cased by the application with `toLowerCase()`, the same function the domain uses to decide two entries are the same. Postgres `lower()` can differ and depends on the locale. Bilbo has no stored key and keeps passing one through the environment.

### Remaining nulls

| Column                                       | Null means                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `settings.glucose_drop_mg_dl_per_unit`       | The correction factor is not set up, so no correction dose is calculated                              |
| `settings.bolus_insulin`, `basal_insulin`    | The user has not chosen an insulin product yet; logging doses is blocked                              |
| `settings.insulin_action_minutes`            | Insulin on board is switched off                                                                      |
| `settings.last_period_start`                 | No cycle start date entered                                                                           |
| `profiles.name`                              | Use the built-in, translated name for this profile                                                    |
| `profiles.percent_adjustment`                | The profile sets a ratio per meal window instead of a percentage                                      |
| `meal_items.glycemic_index`                  | Unknown; `gi_estimated` is true only when it is not null                                              |
| `meal_items.notes`, `warning`                | The parser had nothing to add                                                                         |
| `meal_items.external_id`, `food_snapshot`    | No catalog entry: an estimate, a figure the user gave, or an item logged before entries were recorded |
| `catalog_entries.category`, `published_on`   | The source gives none (phase 2)                                                                       |
| `*.to_release` on the fact tables            | The fact is current (phase 2)                                                                         |
| `fast_insulin_entries.meal_entry_id`         | The dose was not tied to a meal, or its meal was deleted                                              |
| `ratio_versions.profile_id, adjustment_mode` | The meal was logged before the profile was recorded                                                   |
| `ratio_versions.profile_name`                | Use the built-in, translated name, or no profile recorded                                             |
| `ratio_versions.percent_adjustment`          | The profile sets a ratio per window, or no profile recorded                                           |

Everything else is `NOT NULL`.

### Left out on purpose

- **Accounts and people.** No table has an owner yet; see [Accounts and people](#accounts-and-people-later).
- **Where an entry came from.** Imports from a glucose monitor would need a source and an external id for de-duplication; add them with the first importer.
- **`created_at` and `updated_at`.** Nothing reads them, and holding less is the better default for health data.
- **History.** Editing an entry overwrites it; nothing remembers the old value.

## Accounts and people (later)

No table has an owner today. When sign-in arrives, the model separates who signs in from whose data it is, because they are not always the same human: a parent keeps a diary for a child, a partner looks after another's.

- **account**: a login (email, password hash). It is not called a user, because "user" could mean either side of this split.
- **person**: the one whose diabetes data it is. Settings, entries, vocabulary and ratio versions belong to a person (`person_id`), never to an account. A person carries a display name and nothing else that identifies them; no birth date, no address.
- **access**: which account can reach which person, with a `relationship` (self, parent, partner, family, friend, caregiver, clinician) and a `permission` (read, write, admin). One account can reach several people, and one person can be reached by several accounts.

Why "person" and not "patient": the word patient frames Tashi as a medical service, and the project avoids claiming a medical purpose. It is not "profile" because Tashi already has dosing profiles, not "owner" because the owner of the data and the one who signs in can differ, and not "record" or "subject" because a record is a document rather than someone and "subject" reads as research. In Spanish it is simply _persona_.

The migration that adds it is `0002`: create one account and one person for the existing data, add `person_id` (not null, backfilled) to the settings, entry, ratio version and vocabulary tables, and key the two single-row tables (`settings`, `anthropic_api_key`) by person instead of by the single-row constraint. Repositories take the person when they are built, so the domain code and the contract suite change little. Left open until then: whether the Anthropic key belongs to an account or to the instance.

## Review: normal form, units and regrets

A critical pass over the schema above. What was clearly wrong is already fixed in the DDL; the rest is a decision in the next section.

### Normal form

Deliberate denormalisation, kept because a meal is a record of what was shown, not something to recompute:

- Meal totals, per-item `carbs_g`, `fat_g`, `protein_g` and the dose figures are derivable from other columns. Recomputing could round differently from what the user saw. The cost: nothing stops stored parts disagreeing with the stored total, so tests guard it, not the database.
- `total_dose_units` is derivable from the dose parts, using the code's clamping at zero and rounding to the pen increment. It is stored so the record keeps the dose the user saw; a test guards it, so SQL holds no second copy of the rule.
- `food_vocabulary.description_key` is derived from `description`.

Real violations:

- `food_vocabulary.usda_description` depends on the catalog entry, not on the whole key. The same food under two spellings stores its catalog name twice (decision 6).
- `meal_items.estimated` used to repeat what `data_source` said; it is gone, and whether an item is an estimate is read from its source (decision 5).
- `meal_traces.searches` is not an atomic value. It stays `jsonb` on purpose: debugging material, read back whole.

### Units

- **Glucose has one unit in storage: mg/dL.** Settings, corrections and readings all store mg/dL, the unit bilbo's data already uses, so switching the display unit writes nothing and old records stay readable. Values entered in mmol/L are converted on input and kept as doubles, so they convert back to the same figure once rounded for display (decision 3).
- Weight is grams, doses are insulin units, durations are minutes (`insulin_action_minutes`) or milliseconds (`duration_ms`), the cycle is in days. Hours are local hours of the day, and each entry stores the zone it happened in (occurred\_tz). Instants are UTC.
- `weight_g = 0` means "weight not given" for three legacy items whose carbs were already 0. For new items a weight of 0 is not meaningful; make weight nullable if it ever matters.
- `correction_dose_units` has no lower bound: it is negative when glucose is below target.
- Doubles hold ratios such as 6.66 and round-trip exactly. Do not switch them to `numeric` without handling the string the driver returns.

### Regrets worth avoiding now

| Risk                                                                | What to do                                                                                                                                                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two copies of a limit drift (code constant and check constraint)    | Range checks that mirror code were removed from the DDL; the zod schemas own them                                                                                                            |
| Enums mirror code unions                                            | Adding a unit or a language is a migration and a code change that ship together; a new enum value cannot be used in the transaction that adds it. Insulin products avoid this: they are rows |
| Singleton tables (`settings`, `anthropic_api_key`)                  | Adding users changes their primary key: a rewrite of two tiny tables, cheap but not an `ALTER` of a column                                                                                   |
| The whole timeline is read on every call                            | Paginate from the start, cursor-based (see Code changes); insulin on board reads only the last hours                                                                                         |
| `meal_traces.raw_response` grows without bound and is personal data | Keep it for a limited time (say 90 days) and delete older rows, or do not store it                                                                                                           |
| Deleting is not erasing                                             | A deleted entry stays in every dump; the 20-file rotation plus bilbo's borg history define how long, and an erasure promise has to say so                                                    |
| A user who travels                                                  | Hours of the day shift against the same stored windows; fixed: each entry stores occurred\_tz, so local hours stay those of where it happened                                                |
| `uuid` v4 keys scatter inserts                                      | Irrelevant at the size of one person's diary                                                                                                                                                 |

## Decisions to confirm

Decisions 2, 3, 4, 7 and 8 are made. Decisions 1, 5 and 6 are recommendations waiting for confirmation, and the DDL already assumes 5 (`food_sources`). Decided besides: bilbo's existing entries get the time zone Europe/Berlin.

1. **Normalised meals or typed columns plus `jsonb`.** The schema spreads a meal over six tables so nothing is null that should not be. The simpler alternative keeps one `meal_entries` row with typed columns for the totals and one `jsonb` column for items, correction, adjustment and trace: about a third of the mapping code, but items and corrections can no longer be constrained or queried in SQL. Recommendation: normalised for the dose figures and items, `jsonb` only for the parser's searches.
2. **Enum types or text with checks.** Decided: enums for sets whose values each have their own code path (glucose unit, ratio format, entry kind, confidence, adjustment mode, fat and protein trigger); a lookup table for insulin products, which will grow; text with a check for language. Enums can gain values but not lose or rename them.
3. **Glucose in one canonical unit.** Decided: mg/dL everywhere in the database, as `double precision`, with no unit columns. The display unit is a setting, and conversion happens only at the code's edges.
4. **Ids.** Decided: every id for something the user creates is a `uuid`: entries, profiles, meal windows, ratio versions. Built-in profiles get fixed UUIDs (v5 of their old id), kept as constants in code, which is also how the code finds their translated names. Registries the code names keep natural keys (`insulin_products.id`), and foods keep USDA's `fdc_id`. The 21 legacy `<uuid>-ins` ids are replaced with UUIDs derived from the old id (UUID v5), so the migration gives the same result every time.
5. **Provenance of an item.** `data_source` mixed two naming schemes in bilbo's data (`sr_legacy_food`, `survey_fndds_food`, `foundation_food`, `curated`, `USDA FoodData Central`, `LLM estimate`), and `estimated` repeated whether it was an estimate. Recommendation, changed after review: a registry table `food_sources`, like `insulin_products`, not an enum. New catalogs will arrive (the README already names BEDCA), enums cannot drop or rename a value, and each source has properties of its own: `catalog` (its rows live in `foods`) and `estimate` (its figures are an estimate). `meal_items` and `foods` reference it, a composite foreign key keeps `foods` to catalog sources, and `estimated` is gone. Registering a source is one `INSERT` in a migration. The code names `llm_estimate` and `user`, so a test checks the ids in code against the table. The migration maps the old labels to ids: `sr_legacy_food` to `usda_sr_legacy`, `survey_fndds_food` to `usda_survey`, `foundation_food` to `usda_foundation`, `USDA FoodData Central` to `usda_unspecified`, `curated` and `LLM estimate` to their ids.
6. **Vocabulary catalog name.** Drop `usda_description` and read the name from the catalog entry by `(source, external_id)`, so the table holds only what the user did. Recommendation: drop it, once the catalog tables exist in phase 2.
7. **Foods catalog in the database.** Decided: the catalog is imported as catalog entries, facts with sources and releases, and a small curated layer of foods, modelled on USDA FoodData Central, Open Food Facts and EuroFIR (see Foods catalog). It arrives in a second phase; the first migration stores references and a transitional snapshot.
8. **Keys for catalog entries.** Decided: an entry is keyed by `(source, external_id)`, with `external_id` as text, so no source needs a numbering that fits another's. There is no negative-number convention and no surrogate id. The nine BEDCA foods keep the number the catalog build gave them (`-1` to `-9`) as an opaque external id.

## Code changes and bilbo's data

### What changes in the code

- `MealEntry` gets a required `total_dose`, which meal logging records from the calculation, and the request schema for logging a meal requires it. Glucose values in the domain are mg/dL; input parsing and display convert to and from the user's unit, and nothing else does.
- Every list call is paginated from the first release, using keyset cursors. A page is newest first, `ORDER BY occurred_at DESC, id DESC LIMIT n`. The cursor is the `(occurred_at, id)` of the last row returned, opaque to clients, and the next page asks `WHERE (occurred_at, id) < (cursor)`. This matches each entry table's `(occurred_at, id)` index, so Postgres merges the four sorted indexes under the `timeline` view instead of sorting. Pages stay stable when entries are added, unlike offsets. The repository takes `{ before?: Cursor, limit }`; `listSince(time)` serves insulin on board.
- The Postgres repositories write and read the tables above and still return the same domain objects. The mapping is their job and the contract suite covers it.
- The contract suite uses real UUIDs for ids, and the test id generator produces UUID-shaped ids.
- Migration `0001-initial` is rewritten, since nothing deployed has run it.
- The bilbo migration script keeps its existing upgrades and adds: derive `total_dose` (the fat and protein total, else the correction total, else the carb dose); keep glucose values as they are (every stored one is already mg/dL); replace the 21 legacy ids; clear the 2 dangling meal references; turn an empty profile name into null; map each item's old `data_source` label to a `food_sources` id and its `food_item.fdc_id` to `external_id`, keeping the old snapshot (the 37 pre-USDA snapshots have no entry, so those items get none); give every existing meal catalog release 0, "before releases were recorded"; build `ratio_versions` from each meal's window and ratio, with no profile recorded; give profiles and meal windows UUIDs derived from their old id or name (v5); set `occurred_tz` to Europe/Berlin on every existing entry.

### How bilbo's 385 entries map

| Today               | Becomes                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 146 meals           | 146 rows in `meal_entries`, their items in `meal_items`, 135 in `meal_corrections`, 81 in `meal_fat_protein_adjustments`, 119 in `meal_traces` |
| 180 fast insulin    | `fast_insulin_entries`; 21 get new ids; 2 lose a dangling meal link                                                                            |
| 10 slow insulin     | `slow_insulin_entries`                                                                                                                         |
| 49 glucose readings | `glucose_entries`, all mg/dL                                                                                                                   |
| 1 vocabulary entry  | `food_vocabulary`                                                                                                                              |
| `settings.json`     | `settings`, 4 `meal_windows`, 4 `profiles`                                                                                                     |
