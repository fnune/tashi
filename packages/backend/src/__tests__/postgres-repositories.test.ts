import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, FOOD_SOURCES } from "@tashi/shared";
import { Migrator } from "kysely/migration";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { migrations } from "../data/migrations/index.js";
import { connect } from "../data/postgres/connection.js";
import { openPostgresRepositories } from "../data/postgres/index.js";
import { StoredDataError } from "../data/stored-data-error.js";
import type { CatalogBuild, CatalogRecord } from "../domain/food-catalog.js";
import {
  at,
  fastInsulin,
  fullMeal,
  glucose,
  simpleMeal,
  ZONE,
} from "./entries.js";
import { foodCatalogContract } from "./food-catalog-contract.js";
import { repositoryContract } from "./repository-contract.js";
import { sequentialIds, uuidNumber } from "./sequential-ids.js";
import {
  BANANA,
  contractBuild,
  RICE,
  SUGAR,
  testFoodItem,
} from "./test-catalog.js";

const databaseUrl = process.env.TASHI_TEST_DATABASE_URL;

async function query(statement: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await client.query(statement, params);
  } finally {
    await client.end();
  }
}

async function emptyDatabase(catalog: CatalogBuild = contractBuild) {
  const opened = await openPostgresRepositories(databaseUrl ?? "", {
    newId: sequentialIds(1000),
    catalog,
  });
  await query(`TRUNCATE settings, profile_window_ratios, profiles, meal_windows,
    ratio_versions, glucose_entries, slow_insulin_entries, fast_insulin_entries,
    meal_entries, food_vocabulary, anthropic_api_key CASCADE`);
  return opened;
}

async function emptyCatalog(catalog: CatalogBuild) {
  await query(`TRUNCATE settings, profile_window_ratios, profiles, meal_windows,
    ratio_versions, glucose_entries, slow_insulin_entries, fast_insulin_entries,
    meal_entries, food_vocabulary, anthropic_api_key, catalog_entries, foods CASCADE`);
  await query("DELETE FROM catalog_releases WHERE id > 0");
  return openPostgresRepositories(databaseUrl ?? "", {
    newId: sequentialIds(1000),
    catalog,
  });
}

describe.skipIf(!databaseUrl)("postgres", () => {
  repositoryContract("postgres", async () => {
    const { repositories, close } = await emptyDatabase();
    return { repositories, dispose: close };
  });

  foodCatalogContract("postgres", async (records) => {
    const { foodCatalog, close } = await emptyCatalog({
      label: "contract",
      records,
    });
    return { catalog: foodCatalog, dispose: close };
  });

  describe("storage", () => {
    it("applies migrations once and keeps the data when opened again", async () => {
      const first = await emptyDatabase();
      await first.repositories.settings.save({
        ...DEFAULT_SETTINGS,
        target_blood_sugar: 95,
      });
      await first.close();

      const second = await openPostgresRepositories(databaseUrl ?? "", {
        newId: sequentialIds(2000),
        catalog: contractBuild,
      });
      expect(
        (await second.repositories.settings.get()).target_blood_sugar,
      ).toBe(95);
      await second.close();
      const applied = await query(
        "SELECT name FROM kysely_migration ORDER BY name",
      );
      expect(applied.rows).toEqual([
        { name: "0001-initial" },
        { name: "0002-catalog" },
      ]);
    });

    it("registers the same food sources the code knows", async () => {
      const { close } = await emptyDatabase();
      const rows = await query(
        "SELECT id, catalog, estimate FROM food_sources ORDER BY id",
      );
      const expected = Object.entries(FOOD_SOURCES)
        .map(([id, source]) => ({
          id,
          catalog: source.catalog,
          estimate: source.estimate,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
      expect(rows.rows).toEqual(expected);
      await close();
    });

    it("records which catalog release a meal used", async () => {
      const { repositories, close } = await emptyDatabase();
      await repositories.timeline.add([simpleMeal(1, 10)]);
      const rows = await query(
        "SELECT r.label FROM meal_entries m JOIN catalog_releases r ON r.id = m.catalog_release",
      );
      expect(rows.rows).toEqual([{ label: "test-release" }]);
      await close();
    });
  });

  describe("glucose is stored in mg/dL whatever the display unit", () => {
    it("converts what the user types and gives it back in the display unit", async () => {
      const { repositories, close } = await emptyDatabase();
      await repositories.settings.save({
        ...DEFAULT_SETTINGS,
        glucose_unit: "mmol/L",
        target_blood_sugar: 5.6,
        correction_factor: 2.2,
      });
      await repositories.timeline.add([
        { ...glucose(1, 10), unit: "mmol/L", value: 6.4 },
      ]);

      const stored = await query(
        "SELECT target_glucose_mg_dl, glucose_drop_mg_dl_per_unit FROM settings",
      );
      expect(stored.rows[0].target_glucose_mg_dl).toBeCloseTo(100.8896, 4);
      expect(stored.rows[0].glucose_drop_mg_dl_per_unit).toBeCloseTo(
        39.6352,
        4,
      );
      const reading = await query("SELECT glucose_mg_dl FROM glucose_entries");
      expect(reading.rows[0].glucose_mg_dl).toBeCloseTo(115.3024, 4);

      const settings = await repositories.settings.get();
      expect(settings).toMatchObject({
        glucose_unit: "mmol/L",
        target_blood_sugar: 5.6,
        correction_factor: 2.2,
      });
      expect(await repositories.timeline.get(uuidNumber(1))).toMatchObject({
        unit: "mmol/L",
        value: 6.4,
      });
      await close();
    });

    it("shows old readings in the new unit after the unit is switched, without rewriting them", async () => {
      const { repositories, close } = await emptyDatabase();
      await repositories.timeline.add([glucose(1, 10, 144)]);
      const before = await query("SELECT glucose_mg_dl FROM glucose_entries");

      await repositories.settings.save({
        ...DEFAULT_SETTINGS,
        glucose_unit: "mmol/L",
        target_blood_sugar: 5.6,
      });

      const after = await query("SELECT glucose_mg_dl FROM glucose_entries");
      expect(after.rows).toEqual(before.rows);
      const shown = await repositories.timeline.get(uuidNumber(1));
      expect(shown).toMatchObject({ unit: "mmol/L" });
      expect((shown as { value: number }).value).toBeCloseTo(7.993, 3);
      await close();
    });

    it("treats a unit switch that keeps the numbers as a change of display only", async () => {
      const { repositories, close } = await emptyDatabase();
      await repositories.settings.save({
        ...DEFAULT_SETTINGS,
        target_blood_sugar: 100,
        correction_factor: 40,
      });
      const before = await query(
        "SELECT target_glucose_mg_dl, glucose_drop_mg_dl_per_unit FROM settings",
      );

      await repositories.settings.save({
        ...(await repositories.settings.get()),
        glucose_unit: "mmol/L",
      });

      const after = await query(
        "SELECT glucose_unit, target_glucose_mg_dl, glucose_drop_mg_dl_per_unit FROM settings",
      );
      expect(after.rows[0]).toMatchObject({
        glucose_unit: "mmol/L",
        ...before.rows[0],
      });
      const shown = await repositories.settings.get();
      expect(shown.target_blood_sugar).toBeCloseTo(5.55, 2);
      expect(shown.correction_factor).toBeCloseTo(2.22, 2);
      await close();
    });

    it("converts the glucose figures inside a meal's correction", async () => {
      const { repositories, close } = await emptyDatabase();
      await repositories.settings.save({
        ...DEFAULT_SETTINGS,
        glucose_unit: "mmol/L",
        target_blood_sugar: 5.6,
        correction_factor: 2.2,
      });
      const meal = fullMeal(1, 10);
      const inMmol = {
        ...meal,
        correction: {
          ...(meal.correction as NonNullable<typeof meal.correction>),
          current_blood_sugar: 10,
          target_blood_sugar: 5.6,
          correction_factor: 2.2,
        },
      };
      await repositories.timeline.add([inMmol]);
      const row = await query(
        "SELECT current_glucose_mg_dl FROM meal_corrections",
      );
      expect(row.rows[0].current_glucose_mg_dl).toBeCloseTo(180.16, 2);
      expect(await repositories.timeline.get(uuidNumber(1))).toMatchObject({
        correction: { current_blood_sugar: 10, target_blood_sugar: 5.6 },
      });
      await close();
    });
  });

  describe("meals", () => {
    it("shares one ratio version between meals logged under the same ratio", async () => {
      const { repositories, close } = await emptyDatabase();
      await repositories.timeline.add([simpleMeal(1, 10), simpleMeal(2, 20)]);
      const other = simpleMeal(3, 30);
      await repositories.timeline.add([
        { ...other, meal_window: { ...other.meal_window, ratio: 12 } },
      ]);
      const versions = await query(
        "SELECT count(*)::int AS n FROM ratio_versions",
      );
      expect(versions.rows[0].n).toBe(2);
      await close();
    });

    it("refuses an item that points at an entry the catalog does not have", async () => {
      const { close } = await emptyDatabase();
      await expect(
        query(`INSERT INTO ratio_versions (id, window_name, window_start_hour, window_end_hour, carbs_g_per_unit, first_used_at)
          VALUES ('${uuidNumber(1)}', 'w', 1, 2, 10, now());
          INSERT INTO meal_entries (id, occurred_at, occurred_tz, input_text, input_language, ratio_version_id, total_carbs_g, carb_dose_units, total_dose_units, catalog_release)
          VALUES ('${uuidNumber(2)}', now(), 'UTC', 'x', 'en', '${uuidNumber(1)}', 1, 1, 1, 0);
          INSERT INTO meal_items (meal_entry_id, position, description, weight_g, assumed_cooked, confidence, source, carbs_per_100g, carbs_g, fat_per_100g, fat_g, protein_per_100g, protein_g, gi_estimated, external_id)
          VALUES ('${uuidNumber(2)}', 0, 'x', 1, false, 'low', 'usda_sr_legacy', 1, 1, 1, 1, 1, 1, false, '123')`),
      ).rejects.toThrow();
      await close();
    });

    it("refuses an item whose estimate flag disagrees with its source", async () => {
      const { repositories, close } = await emptyDatabase();
      const meal = simpleMeal(1, 10);
      const [item] = meal.items;
      if (!item) throw new Error("no item");
      await expect(
        repositories.timeline.add([
          { ...meal, items: [{ ...item, estimated: false }] },
        ]),
      ).rejects.toThrow(/estimate/);
      await close();
    });
  });

  describe("the schema refuses what it should", () => {
    it("holds a basal product out of a fast insulin entry", async () => {
      const { close } = await emptyDatabase();
      await expect(
        query(
          `INSERT INTO fast_insulin_entries (id, occurred_at, occurred_tz, insulin, insulin_units)
           VALUES ('${uuidNumber(1)}', now(), 'UTC', 'tresiba', 3)`,
        ),
      ).rejects.toThrow();
      await close();
    });

    it("names the entry when a stored row is not in the expected shape", async () => {
      const { repositories, close } = await emptyDatabase();
      await query(
        `INSERT INTO glucose_entries (id, occurred_at, occurred_tz, glucose_mg_dl)
         VALUES ('${uuidNumber(7)}', now(), 'Not/AZone', 100)`,
      );
      await expect(repositories.timeline.page({ limit: 5 })).rejects.toThrow(
        StoredDataError,
      );
      await expect(repositories.timeline.page({ limit: 5 })).rejects.toThrow(
        new RegExp(uuidNumber(7)),
      );
      await close();
    });
  });

  describe("pages", () => {
    it("pages across the four tables with one cursor", async () => {
      const { repositories, close } = await emptyDatabase();
      await repositories.timeline.add([
        glucose(1, 10),
        fullMeal(2, 20),
        fastInsulin(3, 21, 2),
        glucose(4, 30),
        simpleMeal(5, 40),
      ]);
      const first = await repositories.timeline.page({ limit: 2 });
      expect(first.entries.map((e) => e.id)).toEqual([
        uuidNumber(5),
        uuidNumber(4),
      ]);
      const second = await repositories.timeline.page({
        limit: 2,
        before: first.next ?? undefined,
      });
      expect(second.entries.map((e) => e.id)).toEqual([
        uuidNumber(3),
        uuidNumber(2),
      ]);
      expect(at(21)).toBe(second.entries[0]?.timestamp);
      expect(ZONE).toBe(second.entries[0]?.time_zone);
      await close();
    });
  });
});

describe("the migration", () => {
  it("is the phase 1 SQL of the schema document", async () => {
    const doc = readFileSync(
      join(import.meta.dirname, "../../../../docs/database-schema.md"),
      "utf-8",
    );
    const blocks = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) =>
      (m[1] ?? "").trim(),
    );
    const markers = [
      "CREATE TYPE glucose_unit",
      "CREATE TABLE settings (",
      "CREATE TABLE ratio_versions",
      "CREATE TABLE catalog_releases",
      "CREATE TABLE meal_entries",
      "CREATE TABLE glucose_entries",
      "CREATE TABLE food_vocabulary",
    ];
    const expected = markers.map((marker) => {
      const hits = blocks.filter(
        (b) => b.includes(marker) && !b.includes("CREATE TABLE nutrients"),
      );
      expect(hits).toHaveLength(1);
      return hits[0];
    });
    const { schema } = await import("../data/migrations/0001-initial.js");
    expect(schema.trim()).toBe(
      `${expected.join("\n\n")}\n\nINSERT INTO catalog_releases (id, label, imported_at)\n  VALUES (0, 'before releases were recorded', now());`,
    );
  });

  it("is the phase 2 SQL of the schema document", async () => {
    const doc = readFileSync(
      join(import.meta.dirname, "../../../../docs/database-schema.md"),
      "utf-8",
    );
    const blocks = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) =>
      (m[1] ?? "").trim(),
    );
    const { tables, constraints } = await import(
      "../data/migrations/0002-catalog.js"
    );
    expect(blocks).toContain(tables.trim());
    expect(blocks).toContain(constraints.trim());
  });
});

const withRiceChanged = (record: Partial<CatalogRecord>): CatalogRecord => ({
  ...RICE,
  ...record,
});

function build(label: string, ...records: CatalogRecord[]): CatalogBuild {
  return { label, records };
}

async function releaseId(label: string): Promise<number> {
  const { rows } = await query(
    "SELECT id FROM catalog_releases WHERE label = $1",
    [label],
  );
  return rows[0].id;
}

describe.skipIf(!databaseUrl)("the catalog in postgres", () => {
  const first = build("first", RICE, BANANA, SUGAR);

  it("imports every entry, nutrient and curated fact once", async () => {
    const { close } = await emptyCatalog(first);
    const count = async (table: string) =>
      (await query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    expect(await count("catalog_entries")).toBe(3);
    expect(await count("entry_nutrients")).toBe(15);
    expect(await count("entry_servings")).toBe(2);
    expect(await count("foods")).toBe(2);
    expect(await count("food_entries")).toBe(2);
    expect(await count("food_names")).toBe(2);
    expect(await count("food_glycemic_indexes")).toBe(2);
    expect(await count("food_cooking_factors")).toBe(1);
    await close();
  });

  it("writes nothing when the build has not changed", async () => {
    const opened = await emptyCatalog(first);
    await opened.close();
    const again = await openPostgresRepositories(databaseUrl ?? "", {
      newId: sequentialIds(1),
      catalog: first,
    });
    const rows = await query(
      `SELECT (SELECT count(*)::int FROM catalog_releases) AS releases,
        (SELECT count(*)::int FROM entry_nutrients) AS nutrients,
        (SELECT count(*)::int FROM entry_nutrients WHERE to_release IS NOT NULL) AS closed`,
    );
    expect(rows.rows[0]).toEqual({ releases: 2, nutrients: 15, closed: 0 });
    await again.close();
  });

  it("closes a changed figure and adds the new one from the new release", async () => {
    await (await emptyCatalog(first)).close();
    const changed = withRiceChanged({
      nutrients: { ...RICE.nutrients, carbohydrate: 30 },
    });
    const { close, foodCatalog } = await openPostgresRepositories(
      databaseUrl ?? "",
      {
        newId: sequentialIds(1),
        catalog: build("second", changed, BANANA, SUGAR),
      },
    );
    const rows = await query(
      `SELECT amount_per_100g, from_release, to_release FROM entry_nutrients
       WHERE external_id = '169756' AND nutrient_id = 'carbohydrate' ORDER BY from_release`,
    );
    expect(rows.rows).toEqual([
      {
        amount_per_100g: 28.17,
        from_release: await releaseId("first"),
        to_release: await releaseId("second"),
      },
      {
        amount_per_100g: 30,
        from_release: await releaseId("second"),
        to_release: null,
      },
    ]);
    expect((await foodCatalog.getByFdcId(169756))?.total_carbs_per_100g).toBe(
      30,
    );
    await close();
  });

  it("shows a meal the figures of the release it was logged under", async () => {
    const logged = await emptyCatalog(first);
    await logged.repositories.settings.save(DEFAULT_SETTINGS);
    await logged.repositories.timeline.add([fullMeal(1, 10)]);
    await logged.close();

    const second = await openPostgresRepositories(databaseUrl ?? "", {
      newId: sequentialIds(500),
      catalog: build(
        "second",
        withRiceChanged({
          nutrients: { ...RICE.nutrients, carbohydrate: 30 },
          food: RICE.food && {
            ...RICE.food,
            glycemicIndex: { source: "sugirs", value: 80 },
          },
        }),
        BANANA,
        SUGAR,
      ),
    });
    const meal = await second.repositories.timeline.get(uuidNumber(1));
    expect(meal).toMatchObject({
      items: [{ food_item: testFoodItem(RICE) }, { food_item: null }],
    });
    expect((await second.foodCatalog.getByFdcId(169756))?.glycemic_index).toBe(
      80,
    );
    await second.close();
  });

  it("stops offering an entry that left the build and keeps it for old meals", async () => {
    const logged = await emptyCatalog(first);
    await logged.repositories.settings.save(DEFAULT_SETTINGS);
    await logged.repositories.timeline.add([fullMeal(1, 10)]);
    await logged.close();

    const second = await openPostgresRepositories(databaseUrl ?? "", {
      newId: sequentialIds(500),
      catalog: build("second", BANANA, SUGAR),
    });
    expect(await second.foodCatalog.getByFdcId(169756)).toBeNull();
    expect(await second.foodCatalog.search("rice", 10)).toEqual([]);
    expect(await second.repositories.timeline.get(uuidNumber(1))).toMatchObject(
      { items: [{ food_item: testFoodItem(RICE) }, { food_item: null }] },
    );
    await second.close();
  });

  it("replaces a figure that was recorded under the same label instead of closing it", async () => {
    await (await emptyCatalog(first)).close();
    const rewritten = await openPostgresRepositories(databaseUrl ?? "", {
      newId: sequentialIds(1),
      catalog: build(
        "first",
        withRiceChanged({ nutrients: { ...RICE.nutrients, protein: 3 } }),
        BANANA,
        SUGAR,
      ),
    });
    const rows = await query(
      `SELECT amount_per_100g, to_release FROM entry_nutrients
       WHERE external_id = '169756' AND nutrient_id = 'protein'`,
    );
    expect(rows.rows).toEqual([{ amount_per_100g: 3, to_release: null }]);
    await rewritten.close();
  });

  it("corrects a curated name in place and keeps the glycemic index history", async () => {
    await (await emptyCatalog(first)).close();
    const corrected = await openPostgresRepositories(databaseUrl ?? "", {
      newId: sequentialIds(1),
      catalog: build(
        "second",
        withRiceChanged({
          name: "Rice, white, cooked",
          food: RICE.food && {
            ...RICE.food,
            nameEs: "Arroz blanco",
            glycemicIndex: { source: "sugirs", value: 70 },
          },
        }),
        BANANA,
        SUGAR,
      ),
    });
    expect(
      (
        await query(
          "SELECT name FROM catalog_entries WHERE external_id = '169756'",
        )
      ).rows,
    ).toEqual([{ name: "Rice, white, cooked" }]);
    expect(
      (await query("SELECT name FROM food_names ORDER BY name")).rows.map(
        (r) => r.name,
      ),
    ).toEqual(["Arroz blanco", "Plátano"]);
    const indexes = await query(
      `SELECT glycemic_index, to_release IS NULL AS current FROM food_glycemic_indexes
       WHERE food_id = (SELECT id FROM foods WHERE slug = 'rice_white_cooked') ORDER BY from_release`,
    );
    expect(indexes.rows).toEqual([
      { glycemic_index: 73, current: false },
      { glycemic_index: 70, current: true },
    ]);
    await corrected.close();
  });

  it("gives a vocabulary entry the name of its catalog entry", async () => {
    const { repositories, close } = await emptyCatalog(first);
    await repositories.vocabulary.upsert([
      {
        description: "my rice",
        source: "usda_sr_legacy",
        fdc_id: 169756,
        catalog_name: "ignored",
        default_weight_g: 150,
        use_count: 1,
        last_used: "2026-06-13T12:00:00.000Z",
      },
    ]);
    expect(await repositories.vocabulary.list()).toMatchObject([
      { catalog_name: RICE.name },
    ]);
    await close();
  });
});

describe.skipIf(!databaseUrl)("the catalog migration on existing data", () => {
  it("keeps what meals and the vocabulary point at and drops the snapshots", async () => {
    await query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    const db = connect(databaseUrl ?? "");
    const migrator = new Migrator({
      db,
      provider: { getMigrations: async () => migrations },
    });
    expect((await migrator.migrateTo("0001-initial")).error).toBeUndefined();

    const snapshot = testFoodItem(RICE);
    const lateSnapshot = { ...snapshot, total_carbs_per_100g: 30 };
    await query(`INSERT INTO catalog_releases (id, label, imported_at) VALUES (1, 'later', now());
      INSERT INTO ratio_versions (id, window_name, window_start_hour, window_end_hour, carbs_g_per_unit, first_used_at)
      VALUES ('${uuidNumber(1)}', 'w', 1, 2, 10, now())`);
    for (const [n, release, figures] of [
      [2, 0, snapshot],
      [3, 1, lateSnapshot],
    ] as const) {
      await query(
        `INSERT INTO meal_entries (id, occurred_at, occurred_tz, input_text, input_language, ratio_version_id, total_carbs_g, carb_dose_units, total_dose_units, catalog_release)
         VALUES ($1, now() - $2::int * interval '1 minute', 'UTC', 'x', 'en', $3, 1, 1, 1, $4)`,
        [uuidNumber(n), n * 10, uuidNumber(1), release],
      );
      await query(
        `INSERT INTO meal_items (meal_entry_id, position, description, weight_g, assumed_cooked, confidence, source, carbs_per_100g, carbs_g, fat_per_100g, fat_g, protein_per_100g, protein_g, gi_estimated, external_id, food_snapshot)
         VALUES ($1, 0, 'rice', 1, false, 'low', 'usda_sr_legacy', 1, 1, 1, 1, 1, 1, false, '169756', $2::jsonb)`,
        [uuidNumber(n), JSON.stringify(figures)],
      );
    }
    await query(`INSERT INTO food_vocabulary (description_key, source, external_id, description, usda_description, last_weight_g, use_count, last_used_at)
      VALUES ('quinoa', 'usda_sr_legacy', '777', 'Quinoa', 'Quinoa, cooked', 100, 1, now())`);

    expect((await migrator.migrateToLatest()).error).toBeUndefined();

    const entries = await query(
      "SELECT external_id, name FROM catalog_entries ORDER BY external_id",
    );
    expect(entries.rows).toEqual([
      { external_id: "169756", name: RICE.name },
      { external_id: "777", name: "Quinoa, cooked" },
    ]);
    const carbohydrate = await query(
      `SELECT amount_per_100g, from_release, to_release FROM entry_nutrients
       WHERE external_id = '169756' AND nutrient_id = 'carbohydrate'`,
    );
    expect(carbohydrate.rows).toEqual([
      { amount_per_100g: 30, from_release: 0, to_release: null },
    ]);
    const dropped = await query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE column_name IN ('food_snapshot', 'usda_description')`,
    );
    expect(dropped.rows).toEqual([]);
    await expect(
      query(`INSERT INTO meal_items (meal_entry_id, position, description, weight_g, assumed_cooked, confidence, source, carbs_per_100g, carbs_g, fat_per_100g, fat_g, protein_per_100g, protein_g, gi_estimated, external_id)
        VALUES ('${uuidNumber(2)}', 1, 'x', 1, false, 'low', 'usda_sr_legacy', 1, 1, 1, 1, 1, 1, false, '42')`),
    ).rejects.toThrow();

    const opened = await openPostgresRepositories(databaseUrl ?? "", {
      newId: sequentialIds(900),
      catalog: build("after", RICE, BANANA),
    });
    expect(await opened.repositories.timeline.get(uuidNumber(2))).toMatchObject(
      { items: [{ food_item: { total_carbs_per_100g: 30 } }] },
    );
    expect(
      (await opened.foodCatalog.getByFdcId(169756))?.total_carbs_per_100g,
    ).toBe(28.17);
    expect(await opened.repositories.vocabulary.list()).toMatchObject([
      { description: "Quinoa", catalog_name: "Quinoa, cooked" },
    ]);
    await opened.close();
    await db.destroy();
  });
});
