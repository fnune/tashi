// Imports USDA FoodData Central CSV files into a SQLite database.
//
// Source data:
//   - USDA FoodData Central SR Legacy (2018-04)
//     https://fdc.nal.usda.gov/download-datasets
//   - USDA FoodData Central Foundation Foods (2025-12-18)
//   - USDA FoodData Central Survey/FNDDS (2024-10-31)
//
// Usage: tsx scripts/import-usda.ts <usda-data-dir> <output-db-path>
// Example: tsx scripts/import-usda.ts ../../data/usda ../../data/foods.db

import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import initSqlJs from "sql.js";
import { BEDCA_FOODS, CURATED_USDA } from "./curated-foods.js";

const NUTRIENT_CARBS = 1005;
const NUTRIENT_FIBER = 1079;
const NUTRIENT_SUGARS_NLEA = 1063;
const NUTRIENT_SUGARS_TOTAL = 2000;
const NUTRIENT_FAT = 1004;
const NUTRIENT_PROTEIN = 1003;

// Survey (FNDDS) uses legacy nutrient_nbr values in the nutrient_id column
const NUTRIENT_NBR_CARBS = 205;
const NUTRIENT_NBR_FIBER = 291;
const NUTRIENT_NBR_SUGARS = 269;
const NUTRIENT_NBR_FAT = 204;
const NUTRIENT_NBR_PROTEIN = 203;

interface RawFood {
  fdc_id: number;
  data_type: string;
  description: string;
  food_category_id: string;
}

interface NutrientRow {
  fdc_id: number;
  nutrient_id: number;
  amount: number;
}

interface PortionRow {
  fdc_id: number;
  gram_weight: number;
  description: string;
}

interface CategoryRow {
  id: string;
  description: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function readCsv<T>(
  filePath: string,
  mapRow: (fields: string[], headers: string[]) => T | null,
): Promise<T[]> {
  const results: T[] = [];
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let headers: string[] | null = null;
  for await (const line of rl) {
    if (!headers) {
      headers = parseCsvLine(line);
      continue;
    }
    const fields = parseCsvLine(line);
    const row = mapRow(fields, headers);
    if (row !== null) results.push(row);
  }
  return results;
}

function fieldByName(
  fields: string[],
  headers: string[],
  name: string,
): string {
  const idx = headers.indexOf(name);
  if (idx === -1) return "";
  return fields[idx] ?? "";
}

async function loadFoods(dir: string, dataType: string): Promise<RawFood[]> {
  return readCsv(join(dir, "food.csv"), (fields, headers) => {
    const fdc_id = Number(fieldByName(fields, headers, "fdc_id"));
    const dt = fieldByName(fields, headers, "data_type");
    if (dataType && dt !== dataType) return null;
    if (Number.isNaN(fdc_id) || fdc_id <= 0) return null;
    return {
      fdc_id,
      data_type: dt,
      description: fieldByName(fields, headers, "description"),
      food_category_id: fieldByName(fields, headers, "food_category_id"),
    };
  });
}

// Map from legacy nutrient_nbr to canonical nutrient_id
const NBR_TO_ID = new Map<number, number>([
  [NUTRIENT_NBR_CARBS, NUTRIENT_CARBS],
  [NUTRIENT_NBR_FIBER, NUTRIENT_FIBER],
  [NUTRIENT_NBR_SUGARS, NUTRIENT_SUGARS_TOTAL],
  [NUTRIENT_NBR_FAT, NUTRIENT_FAT],
  [NUTRIENT_NBR_PROTEIN, NUTRIENT_PROTEIN],
]);

async function loadNutrients(dir: string): Promise<NutrientRow[]> {
  const wantedIds = new Set([
    NUTRIENT_CARBS,
    NUTRIENT_FIBER,
    NUTRIENT_SUGARS_NLEA,
    NUTRIENT_SUGARS_TOTAL,
    NUTRIENT_FAT,
    NUTRIENT_PROTEIN,
    // Survey uses legacy nutrient_nbr in the nutrient_id column
    NUTRIENT_NBR_CARBS,
    NUTRIENT_NBR_FIBER,
    NUTRIENT_NBR_SUGARS,
    NUTRIENT_NBR_FAT,
    NUTRIENT_NBR_PROTEIN,
  ]);
  return readCsv(join(dir, "food_nutrient.csv"), (fields, headers) => {
    let nutrient_id = Number(fieldByName(fields, headers, "nutrient_id"));
    if (!wantedIds.has(nutrient_id)) return null;
    const amount = Number.parseFloat(fieldByName(fields, headers, "amount"));
    if (Number.isNaN(amount)) return null;
    // Normalize legacy IDs
    nutrient_id = NBR_TO_ID.get(nutrient_id) ?? nutrient_id;
    return {
      fdc_id: Number(fieldByName(fields, headers, "fdc_id")),
      nutrient_id,
      amount,
    };
  });
}

async function loadPortions(dir: string): Promise<PortionRow[]> {
  return readCsv(join(dir, "food_portion.csv"), (fields, headers) => {
    const gram_weight = Number.parseFloat(
      fieldByName(fields, headers, "gram_weight"),
    );
    if (Number.isNaN(gram_weight) || gram_weight <= 0) return null;
    const modifier = fieldByName(fields, headers, "modifier");
    const portion_desc = fieldByName(fields, headers, "portion_description");
    return {
      fdc_id: Number(fieldByName(fields, headers, "fdc_id")),
      gram_weight,
      description: modifier || portion_desc || "",
    };
  });
}

async function loadCategories(dir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const rows = await readCsv<CategoryRow>(
    join(dir, "food_category.csv"),
    (fields, headers) => ({
      id: fieldByName(fields, headers, "id"),
      description: fieldByName(fields, headers, "description"),
    }),
  );
  for (const row of rows) {
    map.set(row.id, row.description);
  }
  return map;
}

async function main() {
  const usdaDir = process.argv[2];
  const outputPath = process.argv[3];

  if (!usdaDir || !outputPath) {
    console.error(
      "Usage: tsx scripts/import-usda.ts <usda-data-dir> <output-db-path>",
    );
    process.exit(1);
  }

  const wasmBuf = await import("node:fs/promises").then((fs) =>
    fs.readFile(
      join(import.meta.dirname, "../node_modules/sql.js/dist/sql-wasm.wasm"),
    ),
  );
  const SQL = await initSqlJs({
    locateFile: () => "sql-wasm.wasm",
    wasmBinary: wasmBuf,
  });
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE foods (
      fdc_id       INTEGER PRIMARY KEY,
      data_type    TEXT NOT NULL,
      description  TEXT NOT NULL,
      category     TEXT,
      total_carbs  REAL,
      fiber        REAL,
      sugars       REAL,
      net_carbs    REAL,
      fat          REAL,
      protein      REAL,
      serving_g    REAL,
      serving_desc TEXT
    );

    CREATE TABLE curated (
      fdc_id             INTEGER PRIMARY KEY REFERENCES foods(fdc_id),
      custom_id          TEXT UNIQUE,
      name_es            TEXT,
      glycemic_index     INTEGER,
      gi_source          TEXT
    );
  `);

  // Load categories (shared across datasets)
  console.log("Loading categories...");
  const categories = await loadCategories(join(usdaDir, "sr_legacy"));

  // Process each dataset
  const datasets = [
    { dir: "sr_legacy", dataType: "sr_legacy_food" },
    { dir: "foundation", dataType: "foundation_food" },
    { dir: "survey", dataType: "survey_fndds_food" },
  ];

  const insertFood = db.prepare(
    "INSERT OR IGNORE INTO foods (fdc_id, data_type, description, category) VALUES (?, ?, ?, ?)",
  );
  const updateNutrients = db.prepare(
    "UPDATE foods SET total_carbs = ?, fiber = ?, sugars = ?, net_carbs = ?, fat = ?, protein = ? WHERE fdc_id = ?",
  );
  const updatePortion = db.prepare(
    "UPDATE foods SET serving_g = ?, serving_desc = ? WHERE fdc_id = ? AND serving_g IS NULL",
  );

  for (const dataset of datasets) {
    const dir = join(usdaDir, dataset.dir);
    console.log(`\nProcessing ${dataset.dir}...`);

    const foods = await loadFoods(dir, dataset.dataType);
    console.log(`  ${foods.length} foods`);

    db.run("BEGIN TRANSACTION");
    for (const food of foods) {
      const category = categories.get(food.food_category_id) ?? null;
      insertFood.bind([
        food.fdc_id,
        food.data_type,
        food.description,
        category,
      ]);
      insertFood.step();
      insertFood.reset();
    }
    db.run("COMMIT");

    console.log("  Loading nutrients...");
    const nutrients = await loadNutrients(dir);
    console.log(`  ${nutrients.length} nutrient rows`);

    const nutrientMap = new Map<number, Map<number, number>>();
    for (const n of nutrients) {
      let foodNutrients = nutrientMap.get(n.fdc_id);
      if (!foodNutrients) {
        foodNutrients = new Map();
        nutrientMap.set(n.fdc_id, foodNutrients);
      }
      // For sugars, prefer NLEA (1063) but fall back to Total (2000)
      if (
        n.nutrient_id === NUTRIENT_SUGARS_TOTAL &&
        foodNutrients.has(NUTRIENT_SUGARS_NLEA)
      ) {
        continue;
      }
      foodNutrients.set(n.nutrient_id, n.amount);
    }

    db.run("BEGIN TRANSACTION");
    for (const [fdcId, nutMap] of nutrientMap) {
      const carbs = nutMap.get(NUTRIENT_CARBS) ?? null;
      const fiber = nutMap.get(NUTRIENT_FIBER) ?? null;
      const sugars =
        nutMap.get(NUTRIENT_SUGARS_NLEA) ??
        nutMap.get(NUTRIENT_SUGARS_TOTAL) ??
        null;
      const netCarbs = carbs !== null ? carbs - (fiber ?? 0) : null;
      const fat = nutMap.get(NUTRIENT_FAT) ?? null;
      const protein = nutMap.get(NUTRIENT_PROTEIN) ?? null;

      updateNutrients.bind([
        carbs,
        fiber,
        sugars,
        netCarbs,
        fat,
        protein,
        fdcId,
      ]);
      updateNutrients.step();
      updateNutrients.reset();
    }
    db.run("COMMIT");

    console.log("  Loading portions...");
    const portions = await loadPortions(dir);
    console.log(`  ${portions.length} portions`);

    db.run("BEGIN TRANSACTION");
    for (const p of portions) {
      updatePortion.bind([p.gram_weight, p.description, p.fdc_id]);
      updatePortion.step();
      updatePortion.reset();
    }
    db.run("COMMIT");
  }

  insertFood.free();
  updateNutrients.free();
  updatePortion.free();

  // Insert BEDCA / curated-only foods
  console.log(`\nInserting ${BEDCA_FOODS.length} BEDCA foods...`);
  db.run("BEGIN TRANSACTION");
  const insertBedca = db.prepare(
    "INSERT INTO foods (fdc_id, data_type, description, category, total_carbs, fiber, sugars, net_carbs, fat, protein, serving_g) VALUES (?, 'curated', ?, 'BEDCA', ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const f of BEDCA_FOODS) {
    insertBedca.bind([
      f.fdc_id,
      f.name_en,
      f.total_carbs,
      f.fiber,
      f.sugars,
      f.net_carbs,
      f.fat,
      f.protein,
      f.typical_serving_g,
    ]);
    insertBedca.step();
    insertBedca.reset();
  }
  insertBedca.free();
  db.run("COMMIT");

  // Insert curated overlay data
  console.log(
    `Inserting ${CURATED_USDA.length + BEDCA_FOODS.length} curated overlays...`,
  );
  db.run("BEGIN TRANSACTION");
  const insertCurated = db.prepare(
    "INSERT OR IGNORE INTO curated (fdc_id, custom_id, name_es, glycemic_index, gi_source) VALUES (?, ?, ?, ?, ?)",
  );
  for (const f of CURATED_USDA) {
    insertCurated.bind([
      f.fdc_id,
      f.custom_id,
      f.name_es,
      f.glycemic_index,
      f.gi_source,
    ]);
    insertCurated.step();
    insertCurated.reset();
  }
  for (const f of BEDCA_FOODS) {
    insertCurated.bind([
      f.fdc_id,
      f.custom_id,
      f.name_es,
      f.glycemic_index,
      f.gi_source,
    ]);
    insertCurated.step();
    insertCurated.reset();
  }
  insertCurated.free();
  db.run("COMMIT");

  // Build FTS4 search index with porter stemmer
  console.log("Building FTS index...");
  db.run(`
    CREATE VIRTUAL TABLE foods_fts USING fts4(
      description,
      tokenize=porter
    )
  `);

  db.run(`
    INSERT INTO foods_fts(rowid, description)
    SELECT fdc_id, description FROM foods
  `);

  const ftsCount = db.exec("SELECT count(*) FROM foods_fts");
  console.log(`  ${ftsCount[0]?.values[0]?.[0] ?? 0} foods indexed`);

  // Summary
  const countResult = db.exec("SELECT count(*) FROM foods");
  const count = countResult[0]?.values[0]?.[0] ?? 0;
  const curatedCount = db.exec("SELECT count(*) FROM curated");
  const cc = curatedCount[0]?.values[0]?.[0] ?? 0;
  const withCarbs = db.exec(
    "SELECT count(*) FROM foods WHERE total_carbs IS NOT NULL",
  );
  const wc = withCarbs[0]?.values[0]?.[0] ?? 0;

  console.log(`\nDone!`);
  console.log(`  Total foods: ${count}`);
  console.log(`  Foods with carb data: ${wc}`);
  console.log(`  Curated overlays: ${cc}`);

  // Export
  const data = db.export();
  db.close();
  await writeFile(outputPath, Buffer.from(data));
  console.log(`  Database written to: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
