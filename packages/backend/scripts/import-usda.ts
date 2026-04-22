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

// Survey (FNDDS) uses legacy nutrient_nbr values in the nutrient_id column
const NUTRIENT_NBR_CARBS = 205;
const NUTRIENT_NBR_FIBER = 291;
const NUTRIENT_NBR_SUGARS = 269;

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
]);

async function loadNutrients(dir: string): Promise<NutrientRow[]> {
  const wantedIds = new Set([
    NUTRIENT_CARBS,
    NUTRIENT_FIBER,
    NUTRIENT_SUGARS_NLEA,
    NUTRIENT_SUGARS_TOTAL,
    // Survey uses legacy nutrient_nbr in the nutrient_id column
    NUTRIENT_NBR_CARBS,
    NUTRIENT_NBR_FIBER,
    NUTRIENT_NBR_SUGARS,
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
      serving_g    REAL,
      serving_desc TEXT
    );

    CREATE TABLE curated (
      fdc_id             INTEGER PRIMARY KEY REFERENCES foods(fdc_id),
      custom_id          TEXT UNIQUE,
      name_es            TEXT,
      glycemic_index     INTEGER,
      gi_source          TEXT,
      cooking_multiplier REAL
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
    "UPDATE foods SET total_carbs = ?, fiber = ?, sugars = ?, net_carbs = ? WHERE fdc_id = ?",
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

      updateNutrients.bind([carbs, fiber, sugars, netCarbs, fdcId]);
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
    "INSERT INTO foods (fdc_id, data_type, description, category, total_carbs, fiber, sugars, net_carbs, serving_g) VALUES (?, 'curated', ?, 'BEDCA', ?, ?, ?, ?, ?)",
  );
  for (const f of BEDCA_FOODS) {
    insertBedca.bind([
      f.fdc_id,
      f.name_en,
      f.total_carbs,
      f.fiber,
      f.sugars,
      f.net_carbs,
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
    "INSERT OR IGNORE INTO curated (fdc_id, custom_id, name_es, glycemic_index, gi_source, cooking_multiplier) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const f of CURATED_USDA) {
    insertCurated.bind([
      f.fdc_id,
      f.custom_id,
      f.name_es,
      f.glycemic_index,
      f.gi_source,
      f.cooking_multiplier,
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
      f.cooking_multiplier,
    ]);
    insertCurated.step();
    insertCurated.reset();
  }
  insertCurated.free();
  db.run("COMMIT");

  // Build word-based search index
  console.log("Building word index...");
  db.run(`
    CREATE TABLE food_words (
      word TEXT NOT NULL,
      fdc_id INTEGER NOT NULL
    );
  `);

  const allFoods = db.exec("SELECT fdc_id, description FROM foods");
  const insertWord = db.prepare(
    "INSERT INTO food_words (word, fdc_id) VALUES (?, ?)",
  );
  db.run("BEGIN TRANSACTION");
  let wordCount = 0;
  for (const [fdcId, desc] of allFoods[0]?.values ?? []) {
    const words = (desc as string)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1)
      .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
    const unique = [...new Set(words)];
    for (const word of unique) {
      insertWord.bind([word, fdcId]);
      insertWord.step();
      insertWord.reset();
      wordCount++;
    }
  }
  insertWord.free();
  db.run("COMMIT");

  db.run("CREATE INDEX idx_food_words_word ON food_words(word)");
  console.log(`  ${wordCount} word entries indexed`);

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
