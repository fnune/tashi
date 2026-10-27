import { type Kysely, sql } from "kysely";

export const tables = String.raw`
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
  FOREIGN KEY (source, source_is_catalog) REFERENCES food_sources (id, catalog),
  PRIMARY KEY (source, external_id)
);
CREATE INDEX catalog_entries_name_search ON catalog_entries USING gin (to_tsvector('english', name));

CREATE TABLE entry_nutrients (
  source text NOT NULL,
  external_id text NOT NULL,
  nutrient_id text NOT NULL REFERENCES nutrients (id),
  amount_per_100g double precision NOT NULL,
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
CREATE UNIQUE INDEX entry_servings_current ON entry_servings (source, external_id, position) WHERE to_release IS NULL;

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
CREATE UNIQUE INDEX food_glycemic_indexes_current ON food_glycemic_indexes (food_id, fact_source) WHERE to_release IS NULL;

CREATE TABLE food_cooking_factors (
  food_id uuid PRIMARY KEY REFERENCES foods (id) ON DELETE CASCADE,
  multiplier double precision NOT NULL CHECK (multiplier > 0),
  fact_source text NOT NULL REFERENCES food_sources (id)
);
`;

export const backfill = String.raw`
CREATE TEMPORARY TABLE backfill_items AS
SELECT DISTINCT ON (i.source, i.external_id)
  i.source, i.external_id,
  min(m.catalog_release) OVER (PARTITION BY i.source, i.external_id) AS release,
  i.food_snapshot AS snapshot
FROM meal_items i
JOIN meal_entries m ON m.id = i.meal_entry_id
WHERE i.external_id IS NOT NULL
ORDER BY i.source, i.external_id, m.catalog_release DESC, m.occurred_at DESC;

INSERT INTO catalog_entries (source, external_id, name, category)
SELECT source, external_id, snapshot ->> 'description', nullif(snapshot ->> 'category', '')
FROM backfill_items;

INSERT INTO catalog_entries (source, external_id, name)
SELECT v.source, v.external_id, v.usda_description
FROM food_vocabulary v
ON CONFLICT DO NOTHING;

INSERT INTO entry_nutrients (source, external_id, nutrient_id, amount_per_100g, from_release)
SELECT b.source, b.external_id, n.nutrient_id, n.amount, b.release
FROM backfill_items b
CROSS JOIN LATERAL (VALUES
  ('carbohydrate', (b.snapshot ->> 'total_carbs_per_100g')::double precision),
  ('fibre', (b.snapshot ->> 'fiber_per_100g')::double precision),
  ('sugars', (b.snapshot ->> 'sugars_per_100g')::double precision),
  ('fat', (b.snapshot ->> 'fat_per_100g')::double precision),
  ('protein', (b.snapshot ->> 'protein_per_100g')::double precision)
) AS n (nutrient_id, amount)
WHERE n.amount IS NOT NULL;

INSERT INTO entry_servings (source, external_id, position, description, grams, from_release)
SELECT source, external_id, 0,
  coalesce(nullif(snapshot ->> 'serving_desc', ''), 'serving'),
  (snapshot ->> 'serving_g')::double precision, release
FROM backfill_items
WHERE (snapshot ->> 'serving_g')::double precision > 0;

DROP TABLE backfill_items;
`;

export const constraints = String.raw`
ALTER TABLE meal_items
  ADD FOREIGN KEY (source, external_id) REFERENCES catalog_entries (source, external_id),
  DROP COLUMN food_snapshot;
ALTER TABLE food_vocabulary
  ADD FOREIGN KEY (source, external_id) REFERENCES catalog_entries (source, external_id),
  DROP COLUMN usda_description;
`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(tables).execute(db);
  await sql.raw(backfill).execute(db);
  await sql.raw(constraints).execute(db);
}
