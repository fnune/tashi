import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import initSqlJs from "sql.js";
import { FoodDatabase } from "../db/food-db.js";

export async function createTestFoodDb(tmpDir: string): Promise<FoodDatabase> {
  const wasmPath = join(
    import.meta.dirname,
    "../../node_modules/sql.js/dist/sql-wasm.wasm",
  );
  const wasmBuf = await import("node:fs/promises").then((fs) =>
    fs.readFile(wasmPath),
  );
  const SQL = await initSqlJs({
    locateFile: () => "sql-wasm.wasm",
    wasmBinary: wasmBuf,
  });
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE foods (
      fdc_id INTEGER PRIMARY KEY,
      data_type TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT,
      total_carbs REAL,
      fiber REAL,
      sugars REAL,
      net_carbs REAL,
      fat REAL,
      protein REAL,
      serving_g REAL,
      serving_desc TEXT
    );
    CREATE TABLE curated (
      fdc_id INTEGER PRIMARY KEY REFERENCES foods(fdc_id),
      custom_id TEXT UNIQUE,
      name_es TEXT,
      glycemic_index INTEGER,
      gi_source TEXT,
      cooking_multiplier REAL
    );
  `);

  // [fdc_id, data_type, description, category, total_carbs, fiber, sugars, net_carbs, fat, protein, serving_g]
  const foods: [
    number,
    string,
    string,
    string,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ][] = [
    [
      169756,
      "sr_legacy_food",
      "Rice, white, long-grain, regular, cooked, enriched",
      "Cereal Grains and Pasta",
      28.17,
      0.4,
      0.05,
      27.77,
      0.28,
      2.69,
      150,
    ],
    [
      173944,
      "sr_legacy_food",
      "Bananas, raw",
      "Fruits and Fruit Juices",
      22.84,
      2.6,
      12.23,
      20.24,
      0.33,
      1.09,
      120,
    ],
    [
      171534,
      "sr_legacy_food",
      "Chicken, broilers or fryers, breast, skinless, boneless, meat only, cooked, grilled",
      "Poultry Products",
      0.0,
      0.0,
      0.0,
      0.0,
      3.57,
      31.02,
      170,
    ],
    [
      169655,
      "sr_legacy_food",
      "Sugars, granulated",
      "Sweets",
      99.98,
      0.0,
      99.8,
      99.98,
      0.0,
      0.0,
      5,
    ],
  ];

  for (const [
    fdc_id,
    data_type,
    desc,
    cat,
    carbs,
    fiber,
    sugars,
    net,
    fat,
    protein,
    serving,
  ] of foods) {
    db.run("INSERT INTO foods VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)", [
      fdc_id,
      data_type,
      desc,
      cat,
      carbs,
      fiber,
      sugars,
      net,
      fat,
      protein,
      serving,
    ]);
  }

  db.run("INSERT INTO curated VALUES (?, ?, ?, ?, ?, ?)", [
    169756,
    "rice_white_cooked",
    "Arroz blanco, cocido",
    73,
    "SUGiRS",
    2.5,
  ]);
  db.run("INSERT INTO curated VALUES (?, ?, ?, ?, ?, ?)", [
    173944,
    "banana",
    "Platano",
    51,
    "SUGiRS",
    null,
  ]);

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

  const dbPath = join(tmpDir, "test-foods.db");
  await writeFile(dbPath, Buffer.from(db.export()));
  db.close();

  return FoodDatabase.open(dbPath);
}
