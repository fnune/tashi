import type { FoodItem, FoodSourceId } from "@tashi/shared";
import { dataSourceOfFoodSource } from "@tashi/shared";

export const NUTRIENT_IDS = [
  "carbohydrate",
  "fibre",
  "sugars",
  "fat",
  "protein",
] as const;

export type NutrientId = (typeof NUTRIENT_IDS)[number];

export interface CatalogRecord {
  source: FoodSourceId;
  externalId: string;
  name: string;
  category: string | null;
  nutrients: Partial<Record<NutrientId, number>>;
  serving: { description: string; grams: number } | null;
  food: CuratedFood | null;
}

export interface CuratedFood {
  slug: string;
  nameEs: string | null;
  glycemicIndex: { source: FoodSourceId; value: number } | null;
}

export interface CatalogBuild {
  label: string;
  records: CatalogRecord[];
}

export type FoodSearchResult = Pick<
  FoodItem,
  | "fdc_id"
  | "description"
  | "category"
  | "net_carbs_per_100g"
  | "fiber_per_100g"
  | "fat_per_100g"
  | "protein_per_100g"
> & { match_count: number };

export interface FoodCatalog {
  getByFdcId(fdcId: number): Promise<FoodItem | null>;
  search(query: string, limit: number): Promise<FoodSearchResult[]>;
}

export function foodItemOf(record: CatalogRecord): FoodItem | null {
  const carbohydrate = record.nutrients.carbohydrate;
  if (carbohydrate === undefined) return null;
  const { fibre, sugars, fat, protein } = record.nutrients;
  const glycemicIndex = record.food?.glycemicIndex ?? null;
  return {
    fdc_id: Number(record.externalId),
    description: record.name,
    data_type: dataSourceOfFoodSource(record.source),
    category: record.category,
    net_carbs_per_100g: Math.max(0, carbohydrate - (fibre ?? 0)),
    total_carbs_per_100g: carbohydrate,
    fiber_per_100g: fibre ?? null,
    sugars_per_100g: sugars ?? null,
    fat_per_100g: fat ?? null,
    protein_per_100g: protein ?? null,
    serving_g: record.serving?.grams ?? null,
    serving_desc: record.serving?.description ?? null,
    name_es: record.food?.nameEs ?? null,
    glycemic_index: glycemicIndex?.value ?? null,
    gi_source: glycemicIndex
      ? dataSourceOfFoodSource(glycemicIndex.source)
      : null,
  };
}

export interface ReleaseRange {
  from_release: number;
  to_release: number | null;
}

// A fact that did not exist yet at the release falls back to the oldest one,
// so a meal logged before a figure was added still shows it.
export function factAt<T extends ReleaseRange>(
  facts: T[],
  release: number | null,
): T | undefined {
  if (release === null) return facts.find((f) => f.to_release === null);
  const valid = facts.find(
    (f) =>
      f.from_release <= release &&
      (f.to_release === null || f.to_release > release),
  );
  if (valid) return valid;
  return [...facts].sort((a, b) => a.from_release - b.from_release)[0];
}
