import type { FoodItem, FoodSourceId } from "@tashi/shared";
import { sql } from "kysely";
import {
  type CatalogRecord,
  type FoodCatalog,
  type FoodMatch,
  factAt,
  foodItemOf,
  type NutrientId,
  type ReleaseRange as Ranged,
} from "../../domain/food-catalog.js";
import type { Db, Executor } from "./connection.js";

export interface EntryKey {
  source: FoodSourceId;
  externalId: string;
}

const SEPARATOR = "\u0000";

export const entryKeyOf = (key: EntryKey) =>
  `${key.source}${SEPARATOR}${key.externalId}`;

export class PostgresFoodCatalog implements FoodCatalog {
  constructor(private db: Db) {}

  async getByFdcId(fdcId: number): Promise<FoodItem | null> {
    const { rows } = await sql<{ source: FoodSourceId; external_id: string }>`
      SELECT source, external_id FROM catalog_entries
      WHERE external_id = ${String(fdcId)}
    `.execute(this.db);
    const keys = rows.map((r) => ({
      source: r.source,
      externalId: r.external_id,
    }));
    const records = await recordsAt(this.db, keys, null);
    for (const key of keys) {
      const record = records.get(entryKeyOf(key));
      const item = record ? foodItemOf(record) : null;
      if (item) return item;
    }
    return null;
  }

  async search(query: string, limit: number): Promise<FoodMatch[]> {
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (words.length === 0) return [];

    const { rows } = await sql<{
      source: FoodSourceId;
      external_id: string;
      match_count: number;
    }>`
      SELECT e.source, e.external_id,
        (SELECT count(*) FROM unnest(${words}::text[]) AS w
          WHERE to_tsvector('english', e.name) @@ plainto_tsquery('english', w))::int AS match_count
      FROM catalog_entries e
      WHERE to_tsvector('english', e.name) @@ to_tsquery('english', ${words.join(" | ")})
        AND EXISTS (
          SELECT 1 FROM entry_nutrients n
          WHERE n.source = e.source AND n.external_id = e.external_id
            AND n.nutrient_id = 'carbohydrate' AND n.to_release IS NULL)
      ORDER BY match_count DESC, length(e.name), e.name, e.external_id
      LIMIT ${limit}
    `.execute(this.db);

    const records = await recordsAt(
      this.db,
      rows.map((r) => ({ source: r.source, externalId: r.external_id })),
      null,
    );
    return rows.flatMap((row) => {
      const record = records.get(
        entryKeyOf({ source: row.source, externalId: row.external_id }),
      );
      const item = record ? foodItemOf(record) : null;
      return item ? [{ ...item, match_count: row.match_count }] : [];
    });
  }
}

function group<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

// `release` null reads what is current now; a number reads what the catalog
// said at that release.
export async function recordsAt(
  db: Executor,
  keys: EntryKey[],
  release: number | null,
): Promise<Map<string, CatalogRecord>> {
  const records = new Map<string, CatalogRecord>();
  if (keys.length === 0) return records;
  const tuples = sql.join(keys.map((k) => sql`(${k.source}, ${k.externalId})`));
  const currentOnly = release === null ? sql`AND to_release IS NULL` : sql``;

  const entries = await sql<{
    source: FoodSourceId;
    external_id: string;
    name: string;
    category: string | null;
  }>`
    SELECT source, external_id, name, category FROM catalog_entries
    WHERE (source, external_id) IN (${tuples})
  `.execute(db);
  const nutrients = group(
    (
      await sql<
        Ranged & {
          source: string;
          external_id: string;
          nutrient_id: NutrientId;
          amount_per_100g: number;
        }
      >`
        SELECT source, external_id, nutrient_id, amount_per_100g, from_release, to_release
        FROM entry_nutrients WHERE (source, external_id) IN (${tuples}) ${currentOnly}
      `.execute(db)
    ).rows,
    (r) => `${r.source}${SEPARATOR}${r.external_id}`,
  );
  const servings = group(
    (
      await sql<
        Ranged & {
          source: string;
          external_id: string;
          description: string;
          grams: number;
        }
      >`
        SELECT source, external_id, description, grams, from_release, to_release
        FROM entry_servings
        WHERE (source, external_id) IN (${tuples}) AND position = 0 ${currentOnly}
      `.execute(db)
    ).rows,
    (r) => `${r.source}${SEPARATOR}${r.external_id}`,
  );
  const foods = new Map(
    (
      await sql<{
        source: string;
        external_id: string;
        food_id: string;
        slug: string;
        name_es: string | null;
        multiplier: number | null;
      }>`
        SELECT fe.source, fe.external_id, fe.food_id, f.slug, fn.name AS name_es, cf.multiplier
        FROM food_entries fe
        JOIN foods f ON f.id = fe.food_id
        LEFT JOIN food_names fn ON fn.food_id = fe.food_id AND fn.language = 'es'
        LEFT JOIN food_cooking_factors cf ON cf.food_id = fe.food_id
        WHERE (fe.source, fe.external_id) IN (${tuples})
      `.execute(db)
    ).rows.map((r) => [`${r.source}${SEPARATOR}${r.external_id}`, r]),
  );
  const glycemicIndexes = group(
    (
      await sql<
        Ranged & {
          food_id: string;
          fact_source: FoodSourceId;
          glycemic_index: number;
        }
      >`
        SELECT food_id, fact_source, glycemic_index, from_release, to_release
        FROM food_glycemic_indexes
        WHERE food_id IN (SELECT food_id FROM food_entries WHERE (source, external_id) IN (${tuples}))
          ${currentOnly}
        ORDER BY fact_source
      `.execute(db)
    ).rows,
    (r) => r.food_id,
  );

  for (const entry of entries.rows) {
    const key = `${entry.source}${SEPARATOR}${entry.external_id}`;
    const record: CatalogRecord = {
      source: entry.source,
      externalId: entry.external_id,
      name: entry.name,
      category: entry.category,
      nutrients: {},
      serving: null,
      food: null,
    };
    const byNutrient = group(nutrients.get(key) ?? [], (r) => r.nutrient_id);
    for (const [nutrient, facts] of byNutrient) {
      const fact = factAt(facts, release);
      if (fact) record.nutrients[nutrient as NutrientId] = fact.amount_per_100g;
    }
    const serving = factAt(servings.get(key) ?? [], release);
    if (serving) {
      record.serving = {
        description: serving.description,
        grams: serving.grams,
      };
    }
    const food = foods.get(key);
    if (food) {
      const bySource = group(
        glycemicIndexes.get(food.food_id) ?? [],
        (r) => r.fact_source,
      );
      const glycemic = [...bySource.values()]
        .map((facts) => factAt(facts, release))
        .find((fact) => fact !== undefined);
      record.food = {
        slug: food.slug,
        nameEs: food.name_es,
        glycemicIndex: glycemic
          ? { source: glycemic.fact_source, value: glycemic.glycemic_index }
          : null,
        cookingMultiplier: food.multiplier,
      };
    }
    records.set(key, record);
  }
  return records;
}
