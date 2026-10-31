import type { FoodItem } from "@tashi/shared";
import { type CatalogBuild, foodItemOf } from "../../domain/food-catalog.js";
import { entriesPath, idsPath, manifestPath, termsPath } from "./layout.js";
import { termsOf } from "./terms.js";

type RankIndex = Record<string, number[]>;

export function catalogAssets(build: CatalogBuild): Map<string, unknown> {
  const inTieBreakOrder = build.records
    .flatMap((record) => {
      const item = foodItemOf(record);
      return item ? [{ record, item }] : [];
    })
    .sort(
      (a, b) =>
        a.item.description.length - b.item.description.length ||
        compare(a.item.description, b.item.description) ||
        compare(a.record.source, b.record.source) ||
        compare(a.record.externalId, b.record.externalId),
    );

  const entries = new Map<string, FoodItem[]>();
  const indexes = new Map<string, RankIndex>();
  const index = (path: string, key: string, rank: number) => {
    const file = indexes.get(path) ?? {};
    const ranks = file[key] ?? [];
    ranks.push(rank);
    file[key] = ranks;
    indexes.set(path, file);
  };
  inTieBreakOrder.forEach(({ item }, rank) => {
    const path = entriesPath(rank);
    const shard = entries.get(path) ?? [];
    shard.push(item);
    entries.set(path, shard);
    index(idsPath(item.fdc_id), String(item.fdc_id), rank);
    for (const term of termsOf(item.description)) {
      index(termsPath(term), term, rank);
    }
  });
  return new Map<string, unknown>([
    [manifestPath, { label: build.label, count: inTieBreakOrder.length }],
    ...entries,
    ...indexes,
  ]);
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
