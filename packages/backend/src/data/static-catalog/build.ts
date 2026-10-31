import type { FoodItem } from "@tashi/shared";
import { type CatalogBuild, foodItemOf } from "../../domain/food-catalog.js";
import { entriesPath, searchIndexPath } from "./layout.js";
import type { FoodSummary, SearchIndexData } from "./search-index.js";
import { termsOf } from "./terms.js";

export interface CatalogContents {
  searchIndex: SearchIndexData;
  entries: Map<string, FoodItem[]>;
}

export function catalogAssets(build: CatalogBuild): Map<string, unknown> {
  const { searchIndex, entries } = catalogContents(build);
  return new Map<string, unknown>([[searchIndexPath, searchIndex], ...entries]);
}

export function catalogContents(build: CatalogBuild): CatalogContents {
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
  const index: SearchIndexData = {
    label: build.label,
    summaries: [],
    terms: {},
  };
  inTieBreakOrder.forEach(({ item }, rank) => {
    const path = entriesPath(rank);
    const shard = entries.get(path) ?? [];
    shard.push(item);
    entries.set(path, shard);
    index.summaries.push(summaryOf(item));
    for (const term of termsOf(item.description)) {
      const ranks = index.terms[term] ?? [];
      ranks.push(rank);
      index.terms[term] = ranks;
    }
  });
  return { searchIndex: index, entries };
}

function summaryOf(item: FoodItem): FoodSummary {
  return [
    item.fdc_id,
    item.description,
    item.category,
    item.net_carbs_per_100g,
    item.fiber_per_100g,
    item.fat_per_100g,
    item.protein_per_100g,
  ];
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
