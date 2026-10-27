import type { FoodItem } from "@tashi/shared";
import {
  type CatalogRecord,
  type FoodCatalog,
  type FoodMatch,
  foodItemOf,
} from "../domain/food-catalog.js";

// Close enough to Postgres's English stemmer for the words the tests use.
const stem = (word: string) => word.replace(/(ing|ed|es|s)$/, "");

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map(stem);

export class InMemoryFoodCatalog implements FoodCatalog {
  constructor(private records: CatalogRecord[]) {}

  async getByFdcId(fdcId: number): Promise<FoodItem | null> {
    for (const record of this.records) {
      if (record.externalId !== String(fdcId)) continue;
      const item = foodItemOf(record);
      if (item) return item;
    }
    return null;
  }

  async search(query: string, limit: number): Promise<FoodMatch[]> {
    const wanted = new Set(words(query));
    const matches = this.records.flatMap((record) => {
      const item = foodItemOf(record);
      const present = new Set(words(record.name));
      const matchCount = [...wanted].filter((w) => present.has(w)).length;
      return item && matchCount > 0
        ? [{ ...item, match_count: matchCount }]
        : [];
    });
    return matches
      .sort(
        (a, b) =>
          b.match_count - a.match_count ||
          a.description.length - b.description.length ||
          a.description.localeCompare(b.description),
      )
      .slice(0, limit);
  }
}
