import type { CatalogBuild, CatalogRecord } from "../domain/food-catalog.js";
import { foodItemOf } from "../domain/food-catalog.js";

function usda(
  externalId: number,
  name: string,
  category: string,
  nutrients: CatalogRecord["nutrients"],
  serving: CatalogRecord["serving"],
  food: CatalogRecord["food"] = null,
): CatalogRecord {
  return {
    source: "usda_sr_legacy",
    externalId: String(externalId),
    name,
    category,
    nutrients,
    serving,
    food,
  };
}

export const RICE = usda(
  169757,
  "Rice, white, long-grain, regular, unenriched, cooked without salt",
  "Cereal Grains and Pasta",
  { carbohydrate: 28.17, fibre: 0.4, sugars: 0.05, fat: 0.28, protein: 2.69 },
  { description: "1 cup", grams: 158 },
  {
    slug: "rice_white_cooked",
    nameEs: "Arroz blanco, cocido",
    glycemicIndex: { source: "sugirs", value: 73 },
    cookingMultiplier: 2.5,
  },
);

export const BANANA = usda(
  173944,
  "Bananas, raw",
  "Fruits and Fruit Juices",
  { carbohydrate: 22.84, fibre: 2.6, sugars: 12.23, fat: 0.33, protein: 1.09 },
  { description: "1 medium", grams: 118 },
  {
    slug: "banana",
    nameEs: "Plátano",
    glycemicIndex: { source: "sugirs", value: 51 },
    cookingMultiplier: null,
  },
);

export const CHICKEN = usda(
  171534,
  "Chicken, broilers or fryers, breast, skinless, boneless, meat only, cooked, grilled",
  "Poultry Products",
  { carbohydrate: 0, fibre: 0, sugars: 0, fat: 3.57, protein: 31.02 },
  { description: "1 breast", grams: 170 },
);

export const SUGAR = usda(
  169655,
  "Sugars, granulated",
  "Sweets",
  { carbohydrate: 99.98, fibre: 0, sugars: 99.8, fat: 0, protein: 0 },
  null,
);

export const testBuild: CatalogBuild = {
  label: "test-release",
  records: [RICE, BANANA, CHICKEN, SUGAR],
};

export const testFoodItem = (record: CatalogRecord) => {
  const item = foodItemOf(record);
  if (!item) throw new Error(`${record.name} has no carbohydrate`);
  return item;
};

// Entries the vocabulary tests point at with made-up ids.
export const vocabularyRecords: CatalogRecord[] = ["1", "2", "3"].flatMap(
  (externalId) =>
    (["usda_sr_legacy", "usda_survey"] as const).map(
      (source): CatalogRecord => ({
        source,
        externalId,
        name: `Catalog ${externalId}`,
        category: null,
        nutrients: { carbohydrate: 10 },
        serving: null,
        food: null,
      }),
    ),
);

export const contractBuild: CatalogBuild = {
  label: testBuild.label,
  records: [...testBuild.records, ...vocabularyRecords],
};
