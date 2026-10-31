import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS, FOOD_SOURCES } from "@tashi/shared";
import { describe, expect, it } from "vitest";
import { statementsOf } from "../data/migrations/0001-initial.js";
import { migrationStatements } from "../data/migrations/index.js";
import { migrate, openSqlite } from "../data/sqlite/connection.js";
import { openSqliteRepositories } from "../data/sqlite/index.js";
import { StoredDataError } from "../data/stored-data-error.js";
import { transactionWriteBatch } from "../data/write-batch.js";
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
import { writeBatchContract } from "./write-batch-contract.js";

const RELEASE = "test-release";

async function emptyDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "tashi-sqlite-"));
  const path = join(directory, "tashi.sqlite");
  const opened = await openSqliteRepositories(path, {
    newId: sequentialIds(1000),
    catalogRelease: RELEASE,
  });
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA foreign_keys = ON");
  return {
    ...opened,
    path,
    query: (statement: string) => raw.prepare(statement).all(),
    exec: (statement: string) => raw.exec(statement),
    close: async () => {
      raw.close();
      await opened.close();
      await rm(directory, { recursive: true });
    },
  };
}

repositoryContract("sqlite", async () => {
  const { repositories, close } = await emptyDatabase();
  return { repositories, dispose: close };
});

writeBatchContract("sqlite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tashi-sqlite-"));
  const db = openSqlite(join(directory, "tashi.sqlite"));
  await migrate(db);
  return {
    db,
    batch: transactionWriteBatch(db),
    dispose: async () => {
      await db.destroy();
      await rm(directory, { recursive: true });
    },
  };
});

describe("sqlite storage", () => {
  it("applies migrations once and keeps the data when opened again", async () => {
    const first = await emptyDatabase();
    await first.repositories.settings.save({
      ...DEFAULT_SETTINGS,
      target_blood_sugar: 95,
    });
    const second = await openSqliteRepositories(first.path, {
      newId: sequentialIds(2000),
      catalogRelease: RELEASE,
    });
    expect((await second.repositories.settings.get()).target_blood_sugar).toBe(
      95,
    );
    await second.close();
    expect(first.query("SELECT name FROM kysely_migration")).toEqual([
      { name: "0001-initial" },
      { name: "0002-accounts" },
      { name: "0003-model-usage" },
    ]);
    await first.close();
  });

  it("registers the same food sources the code knows", async () => {
    const { query, close } = await emptyDatabase();
    const expected = Object.entries(FOOD_SOURCES)
      .map(([id, source]) => ({
        id,
        catalog: Number(source.catalog),
        estimate: Number(source.estimate),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(
      query("SELECT id, catalog, estimate FROM food_sources ORDER BY id"),
    ).toEqual(expected);
    await close();
  });

  it("records which catalog release a meal used", async () => {
    const { repositories, query, close } = await emptyDatabase();
    await repositories.timeline.add([simpleMeal(1, 10), simpleMeal(2, 20)]);
    expect(query("SELECT catalog_release FROM meal_entries")).toEqual([
      { catalog_release: RELEASE },
      { catalog_release: RELEASE },
    ]);
    expect(query("SELECT label FROM catalog_releases")).toEqual([
      { label: RELEASE },
    ]);
    await close();
  });

  it("keeps the food a meal was dosed with as it was then", async () => {
    const { repositories, query, close } = await emptyDatabase();
    const meal = fullMeal(1, 10);
    await repositories.timeline.add([meal]);
    const [stored] = query(
      "SELECT external_id, food_snapshot FROM meal_items WHERE position = 0",
    );
    const food = meal.items[0]?.food_item;
    expect(stored).toEqual({
      external_id: String(food?.fdc_id),
      food_snapshot: JSON.stringify(food),
    });
    await close();
  });

  it("orders entries by time whatever offset their timestamp was written with", async () => {
    const { repositories, close } = await emptyDatabase();
    await repositories.timeline.add([
      { ...glucose(1, 0), timestamp: "2026-06-13T10:30:00+02:00" },
      { ...glucose(2, 0), timestamp: "2026-06-13T09:00:00.000Z" },
    ]);
    const page = await repositories.timeline.page({ limit: 5 });
    expect(page.entries.map((entry) => entry.timestamp)).toEqual([
      "2026-06-13T09:00:00.000Z",
      "2026-06-13T08:30:00.000Z",
    ]);
    await close();
  });
});

describe("glucose is stored in mg/dL whatever the display unit", () => {
  it("converts what the user types and gives it back in the display unit", async () => {
    const { repositories, query, close } = await emptyDatabase();
    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      glucose_unit: "mmol/L",
      target_blood_sugar: 5.6,
      correction_factor: 2.2,
    });
    await repositories.timeline.add([
      { ...glucose(1, 10), unit: "mmol/L", value: 6.4 },
    ]);

    const [stored] = query(
      "SELECT target_glucose_mg_dl, glucose_drop_mg_dl_per_unit FROM settings",
    );
    expect(stored?.target_glucose_mg_dl).toBeCloseTo(100.8896, 4);
    expect(stored?.glucose_drop_mg_dl_per_unit).toBeCloseTo(39.6352, 4);
    const [reading] = query("SELECT glucose_mg_dl FROM glucose_entries");
    expect(reading?.glucose_mg_dl).toBeCloseTo(115.3024, 4);

    expect(await repositories.settings.get()).toMatchObject({
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
    const { repositories, query, close } = await emptyDatabase();
    await repositories.timeline.add([glucose(1, 10, 144)]);
    const before = query("SELECT glucose_mg_dl FROM glucose_entries");

    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      glucose_unit: "mmol/L",
      target_blood_sugar: 5.6,
    });

    expect(query("SELECT glucose_mg_dl FROM glucose_entries")).toEqual(before);
    const shown = await repositories.timeline.get(uuidNumber(1));
    expect(shown).toMatchObject({ unit: "mmol/L" });
    expect((shown as { value: number }).value).toBeCloseTo(7.993, 3);
    await close();
  });

  it("treats a unit switch that keeps the numbers as a change of display only", async () => {
    const { repositories, query, close } = await emptyDatabase();
    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      target_blood_sugar: 100,
      correction_factor: 40,
    });
    const [before] = query(
      "SELECT target_glucose_mg_dl, glucose_drop_mg_dl_per_unit FROM settings",
    );

    await repositories.settings.save({
      ...(await repositories.settings.get()),
      glucose_unit: "mmol/L",
    });

    const [after] = query(
      "SELECT glucose_unit, target_glucose_mg_dl, glucose_drop_mg_dl_per_unit FROM settings",
    );
    expect(after).toEqual({ glucose_unit: "mmol/L", ...before });
    const shown = await repositories.settings.get();
    expect(shown.target_blood_sugar).toBeCloseTo(5.55, 2);
    expect(shown.correction_factor).toBeCloseTo(2.22, 2);
    await close();
  });

  it("converts the glucose figures inside a meal's correction", async () => {
    const { repositories, query, close } = await emptyDatabase();
    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      glucose_unit: "mmol/L",
      target_blood_sugar: 5.6,
      correction_factor: 2.2,
    });
    const meal = fullMeal(1, 10);
    if (!meal.correction) throw new Error("fullMeal has a correction");
    await repositories.timeline.add([
      {
        ...meal,
        correction: {
          ...meal.correction,
          current_blood_sugar: 10,
          target_blood_sugar: 5.6,
          correction_factor: 2.2,
        },
      },
    ]);
    const [row] = query("SELECT current_glucose_mg_dl FROM meal_corrections");
    expect(row?.current_glucose_mg_dl).toBeCloseTo(180.16, 2);
    expect(await repositories.timeline.get(uuidNumber(1))).toMatchObject({
      correction: { current_blood_sugar: 10, target_blood_sugar: 5.6 },
    });
    await close();
  });
});

describe("meals", () => {
  it("shares one ratio version between meals logged under the same ratio", async () => {
    const { repositories, query, close } = await emptyDatabase();
    await repositories.timeline.add([simpleMeal(1, 10), simpleMeal(2, 20)]);
    const other = simpleMeal(3, 30);
    await repositories.timeline.add([
      { ...other, meal_window: { ...other.meal_window, ratio: 12 } },
    ]);
    expect(query("SELECT count(*) AS n FROM ratio_versions")).toEqual([
      { n: 2 },
    ]);
    await close();
  });

  it("refuses an item that names a catalog food without keeping what it said", async () => {
    const { repositories, exec, close } = await emptyDatabase();
    await repositories.timeline.add([simpleMeal(1, 10)]);
    expect(() =>
      exec(`INSERT INTO meal_items (meal_entry_id, position, description, weight_g,
        assumed_cooked, confidence, source, carbs_per_100g, carbs_g, fat_per_100g, fat_g,
        protein_per_100g, protein_g, gi_estimated, external_id)
        VALUES ('${uuidNumber(1)}', 9, 'x', 1, 0, 'low', 'usda_sr_legacy', 1, 1, 1, 1, 1, 1, 0, '123')`),
    ).toThrow(/CHECK/);
    await close();
  });

  it("refuses an item whose estimate flag disagrees with its source", async () => {
    const { repositories, close } = await emptyDatabase();
    const meal = simpleMeal(1, 10);
    const [item] = meal.items;
    if (!item) throw new Error("simpleMeal has an item");
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
    const { exec, close } = await emptyDatabase();
    expect(() =>
      exec(`INSERT INTO fast_insulin_entries (id, occurred_at, occurred_tz, insulin, insulin_units)
        VALUES ('${uuidNumber(1)}', '2026-06-13T08:00:00.000Z', 'UTC', 'tresiba', 3)`),
    ).toThrow(/FOREIGN KEY/);
    await close();
  });

  it("refuses an instant that would not sort with the others", async () => {
    const { exec, close } = await emptyDatabase();
    expect(() =>
      exec(`INSERT INTO glucose_entries (id, occurred_at, occurred_tz, glucose_mg_dl)
        VALUES ('${uuidNumber(1)}', '2026-06-13 08:00', 'UTC', 100)`),
    ).toThrow(/CHECK/);
    await close();
  });

  it("names the entry when a stored row is not in the expected shape", async () => {
    const { repositories, exec, close } = await emptyDatabase();
    exec(`INSERT INTO glucose_entries (id, occurred_at, occurred_tz, glucose_mg_dl)
      VALUES ('${uuidNumber(7)}', '2026-06-13T08:00:00.000Z', 'Not/AZone', 100)`);
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
    expect(second.entries[0]?.timestamp).toBe(at(21));
    expect(second.entries[0]?.time_zone).toBe(ZONE);
    await close();
  });
});

describe("the migration", () => {
  it("is the SQL of the schema document, in order", async () => {
    const doc = await readFile(
      join(import.meta.dirname, "../../../../docs/database-schema.md"),
      "utf-8",
    );
    const blocks = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) =>
      (m[1] ?? "").trim(),
    );
    expect(statementsOf(blocks.join("\n\n"))).toEqual(
      migrationStatements.flatMap((migration) => migration.statements),
    );
  });
});
