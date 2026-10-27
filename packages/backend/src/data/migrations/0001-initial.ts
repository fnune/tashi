import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE settings (
      id boolean PRIMARY KEY DEFAULT true CHECK (id),
      data jsonb NOT NULL
    )
  `.execute(db);

  await sql`
    CREATE TABLE timeline_entries (
      id text PRIMARY KEY,
      type text NOT NULL
        CHECK (type IN ('meal', 'fast_insulin', 'slow_insulin', 'glucose_reading')),
      occurred_at timestamptz NOT NULL,
      units double precision,
      insulin_id text,
      related_meal_id text,
      glucose_value double precision,
      glucose_unit text,
      meal jsonb,
      CHECK ((type = 'meal') = (meal IS NOT NULL)),
      CHECK (type NOT IN ('fast_insulin', 'slow_insulin') OR (units IS NOT NULL AND insulin_id IS NOT NULL)),
      CHECK (type <> 'glucose_reading' OR (glucose_value IS NOT NULL AND glucose_unit IS NOT NULL))
    )
  `.execute(db);
  await sql`
    CREATE INDEX timeline_entries_occurred_at ON timeline_entries (occurred_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE food_vocabulary (
      description_key text NOT NULL,
      fdc_id integer NOT NULL,
      description text NOT NULL,
      usda_description text NOT NULL,
      default_weight_g double precision NOT NULL,
      use_count integer NOT NULL,
      last_used timestamptz NOT NULL,
      PRIMARY KEY (description_key, fdc_id)
    )
  `.execute(db);

  await sql`
    CREATE TABLE api_key (
      id boolean PRIMARY KEY DEFAULT true CHECK (id),
      salt text NOT NULL,
      iv text NOT NULL,
      tag text NOT NULL,
      data text NOT NULL
    )
  `.execute(db);
}
