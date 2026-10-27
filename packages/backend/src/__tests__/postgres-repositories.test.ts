import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, FOOD_SOURCES } from "@tashi/shared";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { openPostgresRepositories } from "../data/postgres/index.js";
import { StoredDataError } from "../data/stored-data-error.js";
import {
  at,
  fastInsulin,
  fullMeal,
  glucose,
  simpleMeal,
  ZONE,
} from "./entries.js";
import { repositoryContract } from "./repository-contract.js";
import { sequentialIds, uuidNumber } from "./sequential-ids.js";

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

async function emptyDatabase() {
  const opened = await openPostgresRepositories(databaseUrl ?? "", {
    newId: sequentialIds(1000),
    catalogRelease: "test-release",
  });
  await query(`TRUNCATE settings, profile_window_ratios, profiles, meal_windows,
    ratio_versions, glucose_entries, slow_insulin_entries, fast_insulin_entries,
    meal_entries, food_vocabulary, anthropic_api_key CASCADE`);
  return opened;
}

describe.skipIf(!databaseUrl)("postgres", () => {
  repositoryContract("postgres", async () => {
    const { repositories, close } = await emptyDatabase();
    return { repositories, dispose: close };
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
        catalogRelease: "test-release",
      });
      expect(
        (await second.repositories.settings.get()).target_blood_sugar,
      ).toBe(95);
      await second.close();
      const applied = await query(
        "SELECT name FROM kysely_migration ORDER BY name",
      );
      expect(applied.rows).toEqual([{ name: "0001-initial" }]);
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

    it("keeps no item without a catalog entry tied to a snapshot", async () => {
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
});
