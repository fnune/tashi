import type { FoodVocabEntry } from "@tashi/shared";
import type { VocabularyRepository } from "../../domain/repositories.js";
import { storedVocabularySchema } from "../../domain/schemas.js";
import { StoredDataError } from "../stored-data-error.js";
import type { Db } from "./connection.js";

export class PostgresVocabularyRepository implements VocabularyRepository {
  constructor(private db: Db) {}

  async list(): Promise<FoodVocabEntry[]> {
    const rows = await this.db
      .selectFrom("food_vocabulary")
      .innerJoin("catalog_entries", (join) =>
        join
          .onRef("catalog_entries.source", "=", "food_vocabulary.source")
          .onRef(
            "catalog_entries.external_id",
            "=",
            "food_vocabulary.external_id",
          ),
      )
      .select([
        "food_vocabulary.description",
        "food_vocabulary.source",
        "food_vocabulary.external_id",
        "food_vocabulary.last_weight_g",
        "food_vocabulary.use_count",
        "food_vocabulary.last_used_at",
        "catalog_entries.name as catalog_name",
      ])
      .orderBy("food_vocabulary.last_used_at", "desc")
      .orderBy("food_vocabulary.description_key")
      .orderBy("food_vocabulary.external_id")
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
          last_used: row.last_used_at.toISOString(),
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
          last_weight_g: entry.default_weight_g,
          use_count: entry.use_count,
          last_used_at: entry.last_used,
        })),
      )
      .onConflict((oc) =>
        oc
          .columns(["description_key", "source", "external_id"])
          .doUpdateSet((eb) => ({
            description: eb.ref("excluded.description"),
            last_weight_g: eb.ref("excluded.last_weight_g"),
            use_count: eb.ref("excluded.use_count"),
            last_used_at: eb.ref("excluded.last_used_at"),
          })),
      )
      .execute();
  }
}
