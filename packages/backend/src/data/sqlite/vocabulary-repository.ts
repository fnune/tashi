import type { FoodVocabEntry } from "@tashi/shared";
import type { VocabularyRepository } from "../../domain/repositories.js";
import { storedVocabularySchema } from "../../domain/schemas.js";
import { StoredDataError } from "../stored-data-error.js";
import { instantOf } from "./columns.js";
import type { Db } from "./connection.js";

export class SqliteVocabularyRepository implements VocabularyRepository {
  constructor(private db: Db) {}

  async list(): Promise<FoodVocabEntry[]> {
    const rows = await this.db
      .selectFrom("food_vocabulary")
      .selectAll()
      .orderBy("last_used_at", "desc")
      .orderBy("description_key")
      .orderBy("external_id")
      .execute();
    try {
      return storedVocabularySchema.parse(
        rows.map((row) => ({
          description: row.description,
          source: row.source,
          fdc_id: Number(row.external_id),
          catalog_name: row.catalog_name,
          default_weight_g: row.last_weight_g,
          use_count: row.use_count,
          last_used: row.last_used_at,
        })),
      );
    } catch (e) {
      throw new StoredDataError("food_vocabulary", e);
    }
  }

  async upsert(entries: FoodVocabEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insertInto("food_vocabulary")
      .values(
        entries.map((entry) => ({
          description_key: entry.description.toLowerCase(),
          source: entry.source,
          external_id: String(entry.fdc_id),
          description: entry.description,
          catalog_name: entry.catalog_name,
          last_weight_g: entry.default_weight_g,
          use_count: entry.use_count,
          last_used_at: instantOf(entry.last_used),
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(["description_key", "source", "external_id"])
          .doUpdateSet((eb) => ({
            description: eb.ref("excluded.description"),
            catalog_name: eb.ref("excluded.catalog_name"),
            last_weight_g: eb.ref("excluded.last_weight_g"),
            use_count: eb.ref("excluded.use_count"),
            last_used_at: eb.ref("excluded.last_used_at"),
          })),
      )
      .execute();
  }

  async clear(): Promise<void> {
    await this.db.deleteFrom("food_vocabulary").execute();
  }
}
