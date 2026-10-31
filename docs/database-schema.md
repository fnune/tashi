# Tashi database schema

Written 2026-10-31.

Tashi stores one person's diary in SQLite: Cloudflare D1 on Workers, and a file through `node:sqlite` on a plain Node install. The SQL blocks below are the migration `0001-initial`, in the order it runs them, and a test checks that they are identical. This document is the reasoning behind them.

**Important: every glucose value is stored in one canonical unit, mg/dL, in every table.** Changing the display unit never rewrites stored data. `settings.glucose_unit` is only a display preference, and conversion happens at the edges of the code: parsing input and formatting output. Columns say so in their names (`_mg_dl`). Conversion uses one constant in code, 1 mmol/L = 18.016 mg/dL (glucose, 180.16 g/mol); values are doubles, so mmol/L entries round-trip once rounded for display.

## What it aims for

- No nullable column unless "not set" is a real state of the world. Each remaining null is listed with its meaning.
- Optional groups of fields become tables whose rows exist only when the group applies.
- A fact that varies by type lives in a table for that type; the timeline is a view over those tables, not a stored table.
- Names say what the value is and its unit: `_g` grams, `_units` insulin units, `_mg_dl` glucose in mg/dL, `_minutes`, `_at` instants, `_hour` local hour of the day.
- The database refuses what the app would also refuse, but ranges the app chooses (plausible glucose, insulin action time, cycle length) live only in the zod schemas, so there are not two copies to drift.
- Every table is `STRICT`, so a column holds only its declared type. SQLite has no enums, booleans, uuids or timestamps, so each is written the same way everywhere:
    - A closed set from the code is `TEXT` with a `CHECK (… IN (…))`.
    - A boolean is `INTEGER` with `CHECK (… IN (0, 1))`; the repositories turn it into `true` and `false`.
    - An id is `TEXT` holding a uuid.
    - An instant is `TEXT` in one format, `YYYY-MM-DDTHH:MM:SS.sssZ` (UTC, milliseconds), which a check enforces by comparing each value with `strftime('%Y-%m-%dT%H:%M:%fZ', …)` of itself; `IS` makes a value that is not a date fail instead of passing as null. (D1 refuses `GLOB` patterns over 50 characters, which a pattern for this format needs.) In that format text order is time order, so indexes and cursors compare text. The repositories write every instant through `toISOString()`, whatever offset the domain gave it.
    - A fraction is `REAL`; JSON is `TEXT` with `CHECK (json_valid(…))`; bytes are `BLOB`.
- The food catalog is not in the database. It ships with the build as static files (see [Catalog and snapshots](#catalog-and-snapshots)); a meal keeps a copy of the figures it was dosed with.

## Registries

Insulin products and food sources are rows, not checks: registering one is an `INSERT` in a migration, and an `(id, action)` foreign key stops a basal column from holding a bolus product. A food source says whether it is a catalog (its figures come from the shipped catalog) and whether its figures are an estimate, so meal items do not repeat either.

```sql
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
```

## Settings

Settings are one row plus meal windows and profiles, saved together in one batch. The repository interface still reads and writes a whole `Settings`.

```sql
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
```

- `target_glucose_mg_dl` and `glucose_drop_mg_dl_per_unit` (how far one insulin unit lowers glucose) are in mg/dL whatever `glucose_unit` says. Changing the display unit changes no stored number.
- A profile adjusts by a percentage or sets a ratio per meal window. The composite foreign key stops a percentage profile from owning window ratios, and the check stops it from lacking its percentage.
- Windows and profiles keep the order the user arranged them in (`position`). SQLite checks a unique constraint row by row and cannot defer it, so a save first moves every position past the current count and then writes the new order.
- A window ratio references its window by id; renaming a window changes one row, and names are unique.
- `last_period_start` is a calendar date as `YYYY-MM-DD`; the check accepts only what `date()` gives back unchanged.
- "The Normal profile cannot be removed" stays a rule of the application.

A meal does not copy the ratio it used; it references a row in `ratio_versions`, the effective ratio for one window under one profile. Settings keep being edited in place; only the effective ratio is versioned.

```sql
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
```

- Logging a meal reuses an existing version or inserts a new one. Rows are never updated or deleted. The effective ratio is still computed by the code.
- SQLite's `UNIQUE` treats nulls as different, so the unique index replaces each nullable column with a value it cannot hold (`''`, or -100 for the percentage, which the check keeps above -100).
- `profile_id` has no foreign key: a profile can be removed, and its versions must stay. `profile_name` null means the built-in, translated name, as in `profiles`.
- The profile columns are null together for meals logged before versions existed; the log never recorded the profile.

## Catalog and snapshots

The catalog (13,670 foods from USDA FoodData Central, a curated layer of 78 foods with Spanish names, glycemic indexes and cooking multipliers, and 9 BEDCA foods) is built from `data/foods.db` into static files: a search index loaded once and the full foods in small shards. It changes only with a build, it is the same for everyone, and on the free D1 plan importing it would take more than a day's 100,000 written rows. So the database holds only what the person did.

```sql
CREATE TABLE catalog_releases (
  label TEXT PRIMARY KEY CHECK (label <> '')
) STRICT;
```

- A catalog release is the label of a build, a hash of `foods.db` (`sha256:e1543601f418`). Logging a meal records the release it was calculated under, inserting the label the first time it is used.
- A meal item that came from the catalog keeps `source` and `external_id` (the catalog's id for the food) and `food_snapshot`, the catalog's figures for that food as JSON, as the calculation saw them: name, category, carbohydrate, fibre, sugars, fat, protein, serving, glycemic index, Spanish name and cooking multiplier. A later catalog changes nothing about the meal. The snapshot is validated with the same schema as the catalog's food items when it is read.
- `external_id` and `food_snapshot` are null together, for an item with no catalog food behind it: an estimate, a figure the user gave, or an item logged before foods were recorded.
- A meal's figures are already stored in its own columns (carbohydrate, fat and protein per 100 g, glycemic index). The snapshot adds what the explainer shows besides: fibre, sugars and where each figure came from.

## Timeline

Every entry has an id and a time; what else it has depends on the kind, so each kind has its own table carrying both. Each has an `(occurred_at, id)` index, so newest-first reads and reads since a moment walk sorted indexes. Ids are uuids, so they do not collide across tables, but nothing in the database enforces that; deleting or editing an entry needs its kind, or the repository tries each table.

```sql
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
```

- `occurred_at` is when the thing happened, as an instant; `occurred_tz` is the IANA zone the user was in (e.g. `Europe/Madrid`), taken from the browser when the entry is logged. A meal logged with a pre-bolus wait is dated in the future of the moment of logging. When an entry was recorded is not stored; nothing uses it.
- The zone is validated by zod against the IANA names the runtime knows. SQLite has no time zones, so a local hour is worked out in code from the instant and the zone.

## Meals

A meal is a record of what was calculated and logged. It is never recalculated, and editing a meal can change only its time. Totals and per-item values are stored as calculated, so the stored dose is the one the user saw.

```sql
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
```

- `carb_dose_units` is the carbohydrate dose rounded to the pen increment. The other parts are `correction_dose_units`, `iob_reduction_units` and `adjustment_dose_units`; the running totals after each step are not stored. `total_dose_units` is what was recommended in all, stored as the user saw it, and a test checks it against the parts with the code's clamping and rounding.
- A row in `meal_corrections` means a glucose reading was entered for that meal (the correction dose is negative below target). A row in `meal_fat_protein_adjustments` means the fat and protein threshold was met. A row in `meal_traces` means the parser recorded how it got its answer.
- `source` says where the figures of an item came from, and the source row says whether they are an estimate; there is no separate flag. The label the interface shows for a source is a translation keyed by its id, not a column. `notes` and `warning` are free text from the parser: absent is null, never an empty string.
- `searches` is the parser's list of queries and what each returned: debugging material, read back whole.

Fast insulin comes after meals because a dose can belong to one, and the timeline view comes last because it reads all four tables:

```sql
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
```

- `fast_insulin_entries.meal_entry_id` is null for a dose not tied to a meal (a correction or a manual entry). Deleting a meal leaves its insulin entry, because the injection happened.

## Vocabulary and API key

The vocabulary is what the user has logged before, offered back to the parser. The API key is sealed with AES-256-GCM, under a key derived by HKDF from `TASHI_SECRET_KEY`, before it reaches the database; bytes are stored as bytes.

```sql
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

CREATE TABLE anthropic_api_key (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  salt BLOB NOT NULL CHECK (length(salt) = 16),
  iv BLOB NOT NULL CHECK (length(iv) = 12),
  auth_tag BLOB NOT NULL CHECK (length(auth_tag) = 16),
  ciphertext BLOB NOT NULL CHECK (length(ciphertext) > 0)
) STRICT;
```

- `description_key` is the description lower-cased by the application with `toLowerCase()`, the same function the domain uses to decide two entries are the same. The check compares it with SQLite's `lower()`, which only folds ASCII; a description with other capitals is still stored, since `toLowerCase()` already folded them.
- `catalog_name` is the catalog's name for the food when it was last logged, kept for the same reason as a meal's snapshot: the catalog is not in the database.

### Remaining nulls

| Column                                       | Null means                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `settings.glucose_drop_mg_dl_per_unit`       | The correction factor is not set up, so no correction dose is calculated                      |
| `settings.bolus_insulin`, `basal_insulin`    | The user has not chosen an insulin product yet; logging doses is blocked                      |
| `settings.insulin_action_minutes`            | Insulin on board is switched off                                                              |
| `settings.last_period_start`                 | No cycle start date entered                                                                   |
| `profiles.name`                              | Use the built-in, translated name for this profile                                            |
| `profiles.percent_adjustment`                | The profile sets a ratio per meal window instead of a percentage                              |
| `meal_items.glycemic_index`                  | Unknown; `gi_estimated` is 1 only when it is not null                                         |
| `meal_items.notes`, `warning`                | The parser had nothing to add                                                                 |
| `meal_items.external_id`, `food_snapshot`    | No catalog food: an estimate, a figure the user gave, or an item logged before foods recorded |
| `fast_insulin_entries.meal_entry_id`         | The dose was not tied to a meal, or its meal was deleted                                      |
| `ratio_versions.profile_id, adjustment_mode` | The meal was logged before the profile was recorded                                           |
| `ratio_versions.profile_name`                | Use the built-in, translated name, or no profile recorded                                     |
| `ratio_versions.percent_adjustment`          | The profile sets a ratio per window, or no profile recorded                                   |

Everything else is `NOT NULL`.

### Left out on purpose

- **Accounts and people.** No table has an owner yet; see [Accounts and people](#accounts-and-people-later).
- **Where an entry came from.** Imports from a glucose monitor would need a source and an external id for de-duplication; add them with the first importer.
- **`created_at` and `updated_at`.** Nothing reads them, and holding less is the better default for health data.
- **History.** Editing an entry overwrites it; nothing remembers the old value.

## Writes

D1 has no interactive transactions, only an atomic batch that cannot read halfway through. Every repository write therefore reads what it needs first and sends all its writes as one batch (`WriteBatch`), which applies them in order or not at all: a D1 `batch()` on Workers, a transaction on Node. The batch type accepts only inserts, updates and deletes, so a read inside one does not compile. With one person writing, read-then-write is an acceptable race.

## Accounts and sign-in

Who signs in, how, and their sessions. The reasoning is in [authentication.md](authentication.md); this is the storage. Migration `0002-accounts` creates it.

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (name <> '' AND length(name) <= 100),
  name_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL CHECK (created_at IS strftime('%Y-%m-%dT%H:%M:%fZ', created_at))
) STRICT;

CREATE TABLE sign_in_methods (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('password')),
  created_at TEXT NOT NULL CHECK (created_at IS strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  UNIQUE (id, kind)
) STRICT;
CREATE UNIQUE INDEX sign_in_methods_one_password ON sign_in_methods (account_id) WHERE kind = 'password';

CREATE TABLE password_methods (
  method_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'password' CHECK (kind = 'password'),
  salt BLOB NOT NULL CHECK (length(salt) = 16),
  iterations INTEGER NOT NULL CHECK (iterations > 0),
  verifier BLOB NOT NULL CHECK (length(verifier) = 32),
  wrapped_data_key BLOB NOT NULL CHECK (length(wrapped_data_key) > 0),
  FOREIGN KEY (method_id, kind) REFERENCES sign_in_methods (id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE sessions (
  token_hash BLOB PRIMARY KEY CHECK (length(token_hash) = 32),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('second_factor', 'signed_in')),
  created_at TEXT NOT NULL CHECK (created_at IS strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  expires_at TEXT NOT NULL CHECK (expires_at IS strftime('%Y-%m-%dT%H:%M:%fZ', expires_at)),
  wrapped_data_key BLOB NOT NULL CHECK (length(wrapped_data_key) > 0)
) STRICT;
CREATE INDEX sessions_by_account ON sessions (account_id);

CREATE TABLE sign_in_failures (
  name_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL CHECK (failures > 0),
  last_failure_at TEXT NOT NULL CHECK (last_failure_at IS strftime('%Y-%m-%dT%H:%M:%fZ', last_failure_at))
) STRICT;
```

- An account's `name_key` is its name trimmed, normalised and lower-cased by the application, so "Ana" and "ana " are one account.
- A sign-in method's own fields live in a table per kind. The composite foreign key and the fixed `kind` of `password_methods` keep a password row on a password method; the partial unique index allows one password per account.
- Sessions and password methods hold their own encrypted copy of the instance's data key. A session stores only the SHA-256 hash of its token; the copy of the data key in it can only be opened with the token, which the database never sees.
- `sign_in_failures` is keyed by the name tried, whether or not an account has it, so failing for a name that does not exist looks the same as failing for one that does.

## Accounts and people (later)

No table has an owner today. When sign-in arrives, the model separates who signs in from whose data it is, because they are not always the same human: a parent keeps a diary for a child, a partner looks after another's.

- **account**: a login (email, password hash). It is not called a user, because "user" could mean either side of this split.
- **person**: the one whose diabetes data it is. Settings, entries, vocabulary and ratio versions belong to a person (`person_id`), never to an account. A person carries a display name and nothing else that identifies them; no birth date, no address.
- **access**: which account can reach which person, with a `relationship` (self, parent, partner, family, friend, caregiver, clinician) and a `permission` (read, write, admin). One account can reach several people, and one person can be reached by several accounts.

Why "person" and not "patient": the word patient frames Tashi as a medical service, and the project avoids claiming a medical purpose. It is not "profile" because Tashi already has dosing profiles, not "owner" because the owner of the data and the one who signs in can differ, and not "record" or "subject" because a record is a document rather than someone and "subject" reads as research. In Spanish it is simply _persona_.

The migration that adds it creates one account and one person for the existing data, adds `person_id` (not null, backfilled) to the settings, entry, ratio version and vocabulary tables, and keys the two single-row tables (`settings`, `anthropic_api_key`) by person instead of by the single-row constraint. SQLite cannot add a foreign key to an existing table, so those tables are rebuilt: create the new table, copy, drop, rename, in one batch. Repositories take the person when they are built, so the domain code and the contract suite change little. Left open until then: whether the Anthropic key belongs to an account or to the instance.

## Review: normal form, units and regrets

### Normal form

Deliberate denormalisation, kept because a meal is a record of what was shown, not something to recompute:

- Meal totals, per-item `carbs_g`, `fat_g`, `protein_g` and the dose figures are derivable from other columns. Recomputing could round differently from what the user saw. The cost: nothing stops stored parts disagreeing with the stored total, so tests guard it, not the database.
- `total_dose_units` is derivable from the dose parts, using the code's clamping at zero and rounding to the pen increment. It is stored so the record keeps the dose the user saw; a test guards it, so SQL holds no second copy of the rule.
- `meal_items.food_snapshot` and `food_vocabulary.catalog_name` copy the catalog. That is the point: they say what the catalog said then.
- `food_vocabulary.description_key` is derived from `description`.
- `meal_traces.searches` is not an atomic value. It stays JSON on purpose: debugging material, read back whole.

### Units

- **Glucose has one unit in storage: mg/dL.** Settings, corrections and readings all store mg/dL, so switching the display unit writes nothing and old records stay readable. Values entered in mmol/L are converted on input and kept as doubles, so they convert back to the same figure once rounded for display.
- Weight is grams, doses are insulin units, durations are minutes (`insulin_action_minutes`) or milliseconds (`duration_ms`), the cycle is in days. Hours are local hours of the day, and each entry stores the zone it happened in (`occurred_tz`). Instants are UTC.
- Carbohydrate is the one figure allowed to be negative. USDA derives it by difference, and for ten foods in the catalog (raw chicken, raw pork) it comes out slightly below zero. A meal records what was calculated, so those values are stored as they were. The net carbohydrate of a food item is never below 0, so these foods add 0 g to a dose and never subtract from it.
- `weight_g = 0` means "weight not given" for three legacy items whose carbs were already 0. For new items a weight of 0 is not meaningful; make weight nullable if it ever matters.
- `correction_dose_units` has no lower bound: it is negative when glucose is below target.

### Regrets worth avoiding now

| Risk                                                                | What to do                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two copies of a limit drift (code constant and check constraint)    | Range checks that mirror code are left out of the DDL; the zod schemas own them                                                                                |
| Checks mirror code unions                                           | Adding a unit or a language is a migration and a code change that ship together, and SQLite changes a check only by rebuilding the table. Insulin products and food sources avoid this: they are rows |
| Singleton tables (`settings`, `anthropic_api_key`)                  | Adding people changes their primary key: a rebuild of two tiny tables                                                                                          |
| The whole timeline is read on every call                            | Pages are cursor-based from the start; insulin on board reads only the last hours                                                                              |
| `meal_traces.raw_response` grows without bound and is personal data | Keep it for a limited time (say 90 days) and delete older rows, or do not store it                                                                             |
| Deleting is not erasing                                             | A deleted entry stays in every backup and, on D1, in 7 days of point-in-time recovery; an erasure promise has to say so                                        |
| An instant written in another format                                | The `strftime` check refuses it, because a second format would break text ordering silently                                                                        |
| `uuid` v4 keys scatter inserts                                      | Irrelevant at the size of one person's diary                                                                                                                   |

## Decisions

1. **Normalised meals.** A meal spreads over five tables so nothing is null that should not be. Items and corrections can be constrained and queried in SQL; only the parser's searches and the catalog snapshot are JSON.
2. **Checks for closed sets, rows for registries.** Sets whose values each have their own code path (glucose unit, ratio format, confidence, adjustment mode, fat and protein trigger, language) are text with a check. Insulin products and food sources, which grow and carry properties, are rows.
3. **Glucose in one canonical unit.** mg/dL everywhere in the database, as `REAL`, with no unit columns. The display unit is a setting, and conversion happens only at the code's edges.
4. **Ids.** Every id for something the user creates is a uuid: entries, profiles, meal windows, ratio versions. Built-in profiles get fixed uuids (v5 of their old id), kept as constants in code, which is also how the code finds their translated names. Registries keep natural keys, and catalog foods keep the catalog's id (USDA's `fdc_id`; the nine BEDCA foods keep `-1` to `-9`) as opaque text.
5. **Provenance of an item.** A registry table `food_sources`, like `insulin_products`: each source says whether it is a catalog and whether its figures are an estimate, and a test checks the ids in code against the table.
6. **The catalog outside the database, and snapshots in meals.** See [Catalog and snapshots](#catalog-and-snapshots). Importing the catalog would not fit the free D1 plan's daily writes, and a snapshot keeps the history a meal needs with less.

