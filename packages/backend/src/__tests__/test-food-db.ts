import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import initSqlJs from "sql.js";
import { FoodDatabase } from "../db/food-db.js";

function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)),
    ),
  ];
}

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
    CREATE TABLE food_words (
      word TEXT NOT NULL,
      fdc_id INTEGER NOT NULL
    );
    CREATE INDEX idx_food_words_word ON food_words(word);
  `);

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
    serving,
  ] of foods) {
    db.run("INSERT INTO foods VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)", [
      fdc_id,
      data_type,
      desc,
      cat,
      carbs,
      fiber,
      sugars,
      net,
      serving,
    ]);
    for (const word of tokenize(desc)) {
      db.run("INSERT INTO food_words VALUES (?, ?)", [word, fdc_id]);
    }
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

  const dbPath = join(tmpDir, "test-foods.db");
  await writeFile(dbPath, Buffer.from(db.export()));
  db.close();

  return FoodDatabase.open(dbPath);
}
