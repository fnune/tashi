import { sql, type Transaction } from "kysely";
import {
  type CatalogBuild,
  type CatalogRecord,
  NUTRIENT_IDS,
} from "../../domain/food-catalog.js";
import { uuidV5 } from "../../domain/uuid.js";
import type { Database } from "../database.js";
import type { Db } from "./connection.js";

type Trx = Transaction<Database>;
type Value = string | number;
type Row = Record<string, Value>;

const FOODS_NAMESPACE = "c1b7e2d4-8f3a-4a6e-b5d9-3e7f0a1c9b42";
const CHUNK_SIZE = 2000;
const SEPARATOR = "\u0000";

// Comparing the whole build with the database on each start costs about a
// second for this catalog; a catalog of millions of entries needs an import
// of its own.
export async function importCatalog(
  db: Db,
  build: CatalogBuild,
): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const release = await releaseOf(trx, build.label);
    await syncEntries(trx, build.records);
    await syncRangedFacts(trx, release, {
      table: "entry_nutrients",
      keyColumns: ["source", "external_id", "nutrient_id"],
      valueColumns: ["amount_per_100g"],
      desired: nutrientRows(build.records),
    });
    await syncRangedFacts(trx, release, {
      table: "entry_servings",
      keyColumns: ["source", "external_id", "position"],
      valueColumns: ["description", "grams"],
      desired: servingRows(build.records),
    });
    await syncCuratedFoods(trx, release, build.records);
    return release;
  });
}

async function releaseOf(trx: Trx, label: string): Promise<number> {
  const existing = await trx
    .selectFrom("catalog_releases")
    .select("id")
    .where("label", "=", label)
    .executeTakeFirst();
  if (existing) return existing.id;
  const latest = await trx
    .selectFrom("catalog_releases")
    .select((eb) => eb.fn.max("id").as("id"))
    .executeTakeFirst();
  const id = (latest?.id ?? -1) + 1;
  await trx
    .insertInto("catalog_releases")
    .values({ id, label, imported_at: new Date() })
    .execute();
  return id;
}

const entryKey = (source: string, externalId: string) =>
  `${source}${SEPARATOR}${externalId}`;

async function syncEntries(trx: Trx, records: CatalogRecord[]): Promise<void> {
  const existing = new Map(
    (
      await trx
        .selectFrom("catalog_entries")
        .select(["source", "external_id", "name", "category"])
        .execute()
    ).map((row) => [entryKey(row.source, row.external_id), row]),
  );
  const added: CatalogRecord[] = [];
  for (const record of records) {
    const known = existing.get(entryKey(record.source, record.externalId));
    if (!known) {
      added.push(record);
    } else if (
      known.name !== record.name ||
      known.category !== record.category
    ) {
      await trx
        .updateTable("catalog_entries")
        .set({ name: record.name, category: record.category })
        .where("source", "=", record.source)
        .where("external_id", "=", record.externalId)
        .execute();
    }
  }
  for (const part of chunks(added)) {
    await trx
      .insertInto("catalog_entries")
      .values(
        part.map((record) => ({
          source: record.source,
          external_id: record.externalId,
          name: record.name,
          category: record.category,
        })),
      )
      .execute();
  }
}

function nutrientRows(records: CatalogRecord[]): Row[] {
  return records.flatMap((record) =>
    NUTRIENT_IDS.flatMap((nutrient) => {
      const amount = record.nutrients[nutrient];
      return amount === undefined
        ? []
        : [
            {
              source: record.source,
              external_id: record.externalId,
              nutrient_id: nutrient,
              amount_per_100g: amount,
            },
          ];
    }),
  );
}

function servingRows(records: CatalogRecord[]): Row[] {
  return records.flatMap((record) =>
    record.serving
      ? [
          {
            source: record.source,
            external_id: record.externalId,
            position: 0,
            description: record.serving.description,
            grams: record.serving.grams,
          },
        ]
      : [],
  );
}

interface RangedFacts {
  table: string;
  keyColumns: string[];
  valueColumns: string[];
  desired: Row[];
}

// A fact never changes: a different figure closes the old row at this release
// and adds a new one. A row created in this very release was never seen by a
// meal, so it is replaced instead.
async function syncRangedFacts(
  trx: Trx,
  release: number,
  { table, keyColumns, valueColumns, desired }: RangedFacts,
): Promise<void> {
  const columns = [...keyColumns, ...valueColumns];
  const keyOf = (row: Row) => keyColumns.map((c) => row[c]).join(SEPARATOR);
  const current = (
    await sql<Row & { from_release: number }>`
      SELECT ${sql.join(columns.map((c) => sql.ref(c)))}, from_release
      FROM ${sql.table(table)} WHERE to_release IS NULL
    `.execute(trx)
  ).rows;
  const currentByKey = new Map(current.map((row) => [keyOf(row), row]));
  const desiredByKey = new Map(desired.map((row) => [keyOf(row), row]));
  const same = (a: Row, b: Row) => valueColumns.every((c) => a[c] === b[c]);

  const outdated = current.filter((row) => {
    const wanted = desiredByKey.get(keyOf(row));
    return !wanted || !same(row, wanted);
  });
  const added = desired.filter((row) => {
    const known = currentByKey.get(keyOf(row));
    return !known || !same(row, known);
  });

  const keyTuples = (rows: Row[]) =>
    sql.join(
      rows.map(
        (row) => sql`(${sql.join(keyColumns.map((c) => row[c] as Value))})`,
      ),
    );
  const keyList = sql.join(keyColumns.map((c) => sql.ref(c)));
  for (const part of chunks(outdated.filter((r) => r.from_release < release))) {
    await sql`
      UPDATE ${sql.table(table)} SET to_release = ${release}
      WHERE to_release IS NULL AND (${keyList}) IN (${keyTuples(part)})
    `.execute(trx);
  }
  for (const part of chunks(
    outdated.filter((r) => r.from_release >= release),
  )) {
    await sql`
      DELETE FROM ${sql.table(table)}
      WHERE to_release IS NULL AND (${keyList}) IN (${keyTuples(part)})
    `.execute(trx);
  }
  for (const part of chunks(added)) {
    await sql`
      INSERT INTO ${sql.table(table)} (${sql.join(columns.map((c) => sql.ref(c)))}, from_release)
      VALUES ${sql.join(
        part.map(
          (row) =>
            sql`(${sql.join(columns.map((c) => row[c] as Value))}, ${release})`,
        ),
      )}
    `.execute(trx);
  }
}

const foodId = (slug: string) => uuidV5(slug, FOODS_NAMESPACE);

// Hand-curated claims are corrected in place, apart from the glycemic index,
// which cites a published table and keeps its history.
async function syncCuratedFoods(
  trx: Trx,
  release: number,
  records: CatalogRecord[],
): Promise<void> {
  const curated = records.flatMap((record) =>
    record.food
      ? [{ record, food: record.food, id: foodId(record.food.slug) }]
      : [],
  );

  const slugs = new Map(curated.map(({ food, id }) => [id, food.slug]));
  for (const part of chunks([...slugs])) {
    await trx
      .insertInto("foods")
      .values(part.map(([id, slug]) => ({ id, slug })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  const links = new Map(
    curated.map(({ record, id }) => [
      entryKey(record.source, record.externalId),
      id,
    ]),
  );
  const inBuild = new Set(
    records.map((record) => entryKey(record.source, record.externalId)),
  );
  const existingLinks = await trx
    .selectFrom("food_entries")
    .select(["source", "external_id"])
    .execute();
  for (const link of existingLinks) {
    const key = entryKey(link.source, link.external_id);
    if (inBuild.has(key) && !links.has(key)) {
      await trx
        .deleteFrom("food_entries")
        .where("source", "=", link.source)
        .where("external_id", "=", link.external_id)
        .execute();
    }
  }
  for (const part of chunks(curated)) {
    await trx
      .insertInto("food_entries")
      .values(
        part.map(({ record, id }) => ({
          food_id: id,
          source: record.source,
          external_id: record.externalId,
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(["source", "external_id"])
          .doUpdateSet((eb) => ({ food_id: eb.ref("excluded.food_id") })),
      )
      .execute();
  }

  const names = new Map(
    curated.flatMap(({ food, id }) =>
      food.nameEs ? [[id, food.nameEs] as const] : [],
    ),
  );
  const syncedFoods = [...slugs.keys()];
  if (syncedFoods.length > 0) {
    await trx
      .deleteFrom("food_names")
      .where("language", "=", "es")
      .where("food_id", "in", syncedFoods)
      .execute();
  }
  for (const part of chunks([...names])) {
    await trx
      .insertInto("food_names")
      .values(
        part.map(([food_id, name]) => ({
          food_id,
          language: "es" as const,
          name,
        })),
      )
      .execute();
  }

  const factors = curated.flatMap(({ food, id }) =>
    food.cookingMultiplier === null
      ? []
      : [
          {
            food_id: id,
            multiplier: food.cookingMultiplier,
            fact_source: "curated",
          },
        ],
  );
  if (syncedFoods.length > 0) {
    await trx
      .deleteFrom("food_cooking_factors")
      .where("food_id", "in", syncedFoods)
      .execute();
  }
  for (const part of chunks(factors)) {
    await trx.insertInto("food_cooking_factors").values(part).execute();
  }

  await syncRangedFacts(trx, release, {
    table: "food_glycemic_indexes",
    keyColumns: ["food_id", "fact_source"],
    valueColumns: ["glycemic_index"],
    desired: curated.flatMap(({ food, id }) =>
      food.glycemicIndex
        ? [
            {
              food_id: id,
              fact_source: food.glycemicIndex.source,
              glycemic_index: food.glycemicIndex.value,
            },
          ]
        : [],
    ),
  });
}

function* chunks<T>(items: T[]): Generator<T[]> {
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    yield items.slice(i, i + CHUNK_SIZE);
  }
}
