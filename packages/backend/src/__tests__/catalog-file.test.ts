import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import initSqlJs from "sql.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readCatalogFile } from "../data/catalog-file.js";

const WASM = join(
  import.meta.dirname,
  "../../node_modules/sql.js/dist/sql-wasm.wasm",
);

async function writeFoodsDb(
  path: string,
  rows: (string | number | null)[][],
  curated: (string | number | null)[][],
) {
  const SQL = await initSqlJs({
    locateFile: () => "sql-wasm.wasm",
    wasmBinary: await readFile(WASM),
  });
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE foods (
      fdc_id INTEGER PRIMARY KEY, data_type TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT, total_carbs REAL, fiber REAL, sugars REAL, net_carbs REAL,
      fat REAL, protein REAL, serving_g REAL, serving_desc TEXT
    );
    CREATE TABLE curated (
      fdc_id INTEGER PRIMARY KEY, custom_id TEXT UNIQUE, name_es TEXT,
      glycemic_index INTEGER, gi_source TEXT, cooking_multiplier REAL
    );
  `);
  for (const row of rows) {
    db.run(
      "INSERT INTO foods VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      row,
    );
  }
  for (const row of curated) {
    db.run("INSERT INTO curated VALUES (?, ?, ?, ?, ?, ?)", row);
  }
  await writeFile(path, Buffer.from(db.export()));
  db.close();
}

describe("the catalog file", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tashi-catalog-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("turns each column into a nutrient and leaves out what is unknown", async () => {
    const path = join(dir, "foods.db");
    await writeFoodsDb(
      path,
      [
        [
          1,
          "sr_legacy_food",
          "Rice",
          "Grains",
          28,
          0.4,
          null,
          27.6,
          0.3,
          null,
          158,
          "1 cup",
        ],
        [
          2,
          "foundation_food",
          "Sugar",
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      ],
      [],
    );
    const { records } = await readCatalogFile(path);
    expect(records).toEqual([
      {
        source: "usda_sr_legacy",
        externalId: "1",
        name: "Rice",
        category: "Grains",
        nutrients: { carbohydrate: 28, fibre: 0.4, fat: 0.3 },
        serving: { description: "1 cup", grams: 158 },
        food: null,
      },
      {
        source: "usda_foundation",
        externalId: "2",
        name: "Sugar",
        category: null,
        nutrients: {},
        serving: null,
        food: null,
      },
    ]);
  });

  it("labels a serving that has no description and keeps negative ids as text", async () => {
    const path = join(dir, "foods.db");
    await writeFoodsDb(
      path,
      [
        [
          -1,
          "curated",
          "Manchego cheese",
          "BEDCA",
          0.5,
          0,
          0.5,
          0.5,
          32,
          25,
          30,
          null,
        ],
      ],
      [[-1, "cheese_manchego", "Queso manchego", null, null, null]],
    );
    const [record] = (await readCatalogFile(path)).records;
    expect(record).toMatchObject({
      source: "curated",
      externalId: "-1",
      serving: { description: "serving", grams: 30 },
      food: {
        slug: "cheese_manchego",
        nameEs: "Queso manchego",
        glycemicIndex: null,
      },
    });
  });

  it("maps the source of a glycemic index to its registry id, ignoring the cooking_multiplier column of catalogs built before it was dropped", async () => {
    const path = join(dir, "foods.db");
    await writeFoodsDb(
      path,
      [
        [
          1,
          "sr_legacy_food",
          "Rice",
          null,
          28,
          0.4,
          0,
          27.6,
          0.3,
          2.7,
          null,
          null,
        ],
      ],
      [[1, "rice", "Arroz", 73, "SUGiRS", 2.5]],
    );
    const [record] = (await readCatalogFile(path)).records;
    expect(record?.food).toEqual({
      slug: "rice",
      nameEs: "Arroz",
      glycemicIndex: { source: "sugirs", value: 73 },
    });
  });

  it("labels the release by the content of the file", async () => {
    const a = join(dir, "a.db");
    const b = join(dir, "b.db");
    const row = [
      1,
      "sr_legacy_food",
      "Rice",
      null,
      28,
      0.4,
      0,
      27.6,
      0.3,
      2.7,
      null,
      null,
    ];
    await writeFoodsDb(a, [row], []);
    await writeFoodsDb(b, [[...row.slice(0, 4), 29, ...row.slice(5)]], []);
    const first = (await readCatalogFile(a)).label;
    expect(first).toMatch(/^sha256:[0-9a-f]{12}$/);
    expect((await readCatalogFile(a)).label).toBe(first);
    expect((await readCatalogFile(b)).label).not.toBe(first);
  });

  it("reads the catalog Tashi ships", async () => {
    const { records } = await readCatalogFile(
      join(import.meta.dirname, "../../../../data/foods.db"),
    );
    expect(records).toHaveLength(13670);
    const keys = new Set(records.map((r) => `${r.source}/${r.externalId}`));
    expect(keys.size).toBe(records.length);
    const slugs = records.flatMap((r) => (r.food ? [r.food.slug] : []));
    expect(new Set(slugs).size).toBe(slugs.length);
    const amounts = records.flatMap((r) => Object.values(r.nutrients));
    expect(amounts.every(Number.isFinite)).toBe(true);
    expect(
      records.filter((r) => r.nutrients.carbohydrate === undefined),
    ).toHaveLength(61);
  });
});
