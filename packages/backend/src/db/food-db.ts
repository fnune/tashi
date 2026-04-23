import { readFile } from "node:fs/promises";
import { join } from "node:path";
import initSqlJs, { type Database } from "sql.js";

export interface FoodMatch {
  fdc_id: number;
  description: string;
  data_type: string;
  category: string | null;
  net_carbs_per_100g: number;
  total_carbs_per_100g: number;
  fiber_per_100g: number;
  sugars_per_100g: number;
  serving_g: number | null;
  serving_desc: string | null;
  name_es: string | null;
  glycemic_index: number | null;
  gi_source: string | null;
  cooking_multiplier: number | null;
  match_count: number;
}

function countMatchingPhrases(buf: Uint8Array): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const p = view.getUint32(0, true);
  const c = view.getUint32(4, true);
  let count = 0;
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < c; j++) {
      const off = 8 + (i * c + j) * 3 * 4;
      if (view.getUint32(off, true) > 0) {
        count++;
        break;
      }
    }
  }
  return count;
}

export class FoodDatabase {
  private db: Database;

  private constructor(db: Database) {
    this.db = db;
  }

  static async open(dbPath: string): Promise<FoodDatabase> {
    const wasmPath = join(
      import.meta.dirname,
      "../../node_modules/sql.js/dist/sql-wasm.wasm",
    );
    const SQL = await initSqlJs({
      locateFile: () => wasmPath,
    });
    const buffer = await readFile(dbPath);
    const db = new SQL.Database(buffer);
    return new FoodDatabase(db);
  }

  search(query: string, limit = 10): FoodMatch[] {
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);

    if (words.length === 0) return [];

    const ftsQuery = words.join(" OR ");

    const stmt = this.db.prepare(`
      SELECT
        f.fdc_id,
        f.description,
        f.data_type,
        f.category,
        COALESCE(f.net_carbs, 0.0) AS net_carbs_per_100g,
        COALESCE(f.total_carbs, 0.0) AS total_carbs_per_100g,
        COALESCE(f.fiber, 0.0) AS fiber_per_100g,
        COALESCE(f.sugars, 0.0) AS sugars_per_100g,
        f.serving_g,
        f.serving_desc,
        c.name_es,
        c.glycemic_index,
        c.gi_source,
        c.cooking_multiplier,
        matchinfo(foods_fts, 'pcx') AS mi
      FROM foods_fts
      JOIN foods f ON f.fdc_id = foods_fts.rowid
      LEFT JOIN curated c ON c.fdc_id = f.fdc_id
      WHERE foods_fts MATCH :query
    `);

    stmt.bind({ ":query": ftsQuery });

    const results: FoodMatch[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const mi = row.mi as Uint8Array;
      results.push({
        ...this.rowToMatch(row),
        match_count: countMatchingPhrases(mi),
      });
    }
    stmt.free();

    results.sort(
      (a, b) =>
        b.match_count - a.match_count ||
        a.description.length - b.description.length,
    );

    return results.slice(0, limit);
  }

  getByFdcId(fdcId: number): FoodMatch | null {
    const stmt = this.db.prepare(`
      SELECT
        f.fdc_id,
        f.description,
        f.data_type,
        f.category,
        COALESCE(f.net_carbs, 0.0) AS net_carbs_per_100g,
        COALESCE(f.total_carbs, 0.0) AS total_carbs_per_100g,
        COALESCE(f.fiber, 0.0) AS fiber_per_100g,
        COALESCE(f.sugars, 0.0) AS sugars_per_100g,
        f.serving_g,
        f.serving_desc,
        c.name_es,
        c.glycemic_index,
        c.gi_source,
        c.cooking_multiplier,
        0 AS match_count
      FROM foods f
      LEFT JOIN curated c ON c.fdc_id = f.fdc_id
      WHERE f.fdc_id = :fdc_id
    `);
    stmt.bind({ ":fdc_id": fdcId });
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject();
    stmt.free();
    return this.rowToMatch(row);
  }

  private rowToMatch(row: Record<string, unknown>): FoodMatch {
    return {
      fdc_id: row.fdc_id as number,
      description: row.description as string,
      data_type: row.data_type as string,
      category: (row.category as string) ?? null,
      net_carbs_per_100g: row.net_carbs_per_100g as number,
      total_carbs_per_100g: row.total_carbs_per_100g as number,
      fiber_per_100g: row.fiber_per_100g as number,
      sugars_per_100g: row.sugars_per_100g as number,
      serving_g: (row.serving_g as number) ?? null,
      serving_desc: (row.serving_desc as string) ?? null,
      name_es: (row.name_es as string) ?? null,
      glycemic_index: (row.glycemic_index as number) ?? null,
      gi_source: (row.gi_source as string) ?? null,
      cooking_multiplier: (row.cooking_multiplier as number) ?? null,
      match_count: (row.match_count as number) ?? 0,
    };
  }

  foodCount(): number {
    const result = this.db.exec("SELECT count(*) FROM foods");
    return (result[0]?.values[0]?.[0] as number) ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
