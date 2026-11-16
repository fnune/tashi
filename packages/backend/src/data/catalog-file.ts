import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { foodSourceOfDataSource } from "@tashi/shared";
import initSqlJs from "sql.js";
import type {
  CatalogBuild,
  CatalogRecord,
  NutrientId,
} from "../domain/food-catalog.js";

const NUTRIENT_COLUMNS: [NutrientId, string][] = [
  ["carbohydrate", "total_carbs"],
  ["fibre", "fiber"],
  ["sugars", "sugars"],
  ["fat", "fat"],
  ["protein", "protein"],
];

const UNLABELLED_SERVING = "serving";

export async function readCatalogFile(path: string): Promise<CatalogBuild> {
  const wasmPath = join(
    import.meta.dirname,
    "../../node_modules/sql.js/dist/sql-wasm.wasm",
  );
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const buffer = await readFile(path);
  const db = new SQL.Database(buffer);
  try {
    const statement = db.prepare(`
      SELECT f.fdc_id, f.data_type, f.description, f.category,
        f.total_carbs, f.fiber, f.sugars, f.fat, f.protein,
        f.serving_g, f.serving_desc,
        c.custom_id, c.name_es, c.glycemic_index, c.gi_source
      FROM foods f
      LEFT JOIN curated c ON c.fdc_id = f.fdc_id
      ORDER BY f.fdc_id
    `);
    const records: CatalogRecord[] = [];
    while (statement.step()) {
      records.push(recordOf(statement.getAsObject()));
    }
    statement.free();
    const digest = createHash("sha256").update(buffer).digest("hex");
    return { label: `sha256:${digest.slice(0, 12)}`, records };
  } finally {
    db.close();
  }
}

function recordOf(row: Record<string, unknown>): CatalogRecord {
  const nutrients: CatalogRecord["nutrients"] = {};
  for (const [nutrient, column] of NUTRIENT_COLUMNS) {
    const value = row[column];
    if (typeof value === "number") nutrients[nutrient] = value;
  }
  const servingGrams = row.serving_g;
  const slug = row.custom_id;
  const glycemicIndex = row.glycemic_index;
  return {
    source: foodSourceOfDataSource(row.data_type as string),
    externalId: String(row.fdc_id),
    name: row.description as string,
    category: (row.category as string | null) || null,
    nutrients,
    serving:
      typeof servingGrams === "number" && servingGrams > 0
        ? {
            description: (row.serving_desc as string) || UNLABELLED_SERVING,
            grams: servingGrams,
          }
        : null,
    food:
      typeof slug === "string"
        ? {
            slug,
            nameEs: (row.name_es as string | null) ?? null,
            glycemicIndex:
              typeof glycemicIndex === "number"
                ? {
                    source: foodSourceOfDataSource(row.gi_source as string),
                    value: glycemicIndex,
                  }
                : null,
          }
        : null,
  };
}
