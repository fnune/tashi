import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CatalogRecord, FoodCatalog } from "../domain/food-catalog.js";
import { BANANA, CHICKEN, RICE, SUGAR, testFoodItem } from "./test-catalog.js";

export interface CatalogHarness {
  catalog: FoodCatalog;
  dispose(): Promise<void>;
}

const record = (
  externalId: string,
  name: string,
  nutrients: CatalogRecord["nutrients"],
): CatalogRecord => ({
  source: "usda_foundation",
  externalId,
  name,
  category: null,
  nutrients,
  serving: null,
  food: null,
});

const WITHOUT_FIBRE = record("9001", "Dumpling, steamed", {
  carbohydrate: 40,
  fat: 2,
});
const WITHOUT_CARBOHYDRATE = record("9002", "Mystery dumpling filling", {
  fat: 9,
  protein: 8,
});
const BELOW_ZERO = record("9003", "Chicken, raw dumpling", {
  carbohydrate: -0.7,
  fibre: 0,
  fat: 3,
  protein: 20,
});

export const catalogContractRecords = [
  RICE,
  BANANA,
  CHICKEN,
  SUGAR,
  WITHOUT_FIBRE,
  WITHOUT_CARBOHYDRATE,
  BELOW_ZERO,
];

export function foodCatalogContract(
  name: string,
  open: (records: CatalogRecord[]) => Promise<CatalogHarness>,
) {
  describe(`${name} food catalog`, () => {
    let harness: CatalogHarness;
    let catalog: FoodCatalog;

    beforeEach(async () => {
      harness = await open(catalogContractRecords);
      catalog = harness.catalog;
    });

    afterEach(async () => {
      await harness.dispose();
    });

    describe("lookup", () => {
      it("returns a food with its curated facts", async () => {
        expect(await catalog.getByFdcId(169756)).toEqual(testFoodItem(RICE));
        expect(
          (await catalog.getByFdcId(169756))?.net_carbs_per_100g,
        ).toBeCloseTo(27.77);
        expect(await catalog.getByFdcId(169756)).toMatchObject({
          data_type: "sr_legacy_food",
          name_es: "Arroz blanco, cocido",
          glycemic_index: 73,
          gi_source: "SUGiRS",
          cooking_multiplier: 2.5,
          serving_g: 158,
          serving_desc: "1 cup",
        });
      });

      it("leaves the curated facts empty for a plain entry", async () => {
        expect(await catalog.getByFdcId(171534)).toMatchObject({
          name_es: null,
          glycemic_index: null,
          gi_source: null,
          cooking_multiplier: null,
          serving_g: 170,
        });
      });

      it("returns null for an unknown id", async () => {
        expect(await catalog.getByFdcId(1)).toBeNull();
      });

      it("takes the carbohydrate for the net carbohydrate when fibre is unknown", async () => {
        expect(await catalog.getByFdcId(9001)).toMatchObject({
          total_carbs_per_100g: 40,
          net_carbs_per_100g: 40,
          fiber_per_100g: null,
          sugars_per_100g: null,
          protein_per_100g: null,
          fat_per_100g: 2,
        });
      });

      it("never lets the net carbohydrate drop below zero", async () => {
        expect(await catalog.getByFdcId(9003)).toMatchObject({
          total_carbs_per_100g: -0.7,
          net_carbs_per_100g: 0,
        });
      });

      it("does not return an entry that has no carbohydrate figure", async () => {
        expect(await catalog.getByFdcId(9002)).toBeNull();
      });
    });

    describe("search", () => {
      it("finds foods by matching words", async () => {
        const results = await catalog.search("rice white cooked", 10);
        expect(results[0]?.fdc_id).toBe(169756);
      });

      it("matches when only some of the words are present", async () => {
        const results = await catalog.search("banana", 10);
        expect(results.map((r) => r.fdc_id)).toEqual([173944]);
      });

      it("ranks by the number of matching words", async () => {
        const results = await catalog.search(
          "chicken breast grilled cooked",
          10,
        );
        expect(results[0]?.fdc_id).toBe(171534);
        expect(results[0]?.match_count).toBe(4);
        expect(results.map((r) => r.fdc_id)).toContain(169756);
      });

      it("puts the shorter name first among equal matches", async () => {
        const results = await catalog.search("dumpling", 10);
        expect(results.map((r) => r.fdc_id)).toEqual([9001, 9003]);
      });

      it("returns nothing for words that match nothing", async () => {
        expect(await catalog.search("xyznonexistent", 10)).toEqual([]);
        expect(await catalog.search("  ", 10)).toEqual([]);
      });

      it("matches other forms of a word", async () => {
        const results = await catalog.search("cooking", 10);
        expect(results.map((r) => r.fdc_id)).toContain(169756);
      });

      it("stops at the limit", async () => {
        expect(await catalog.search("cooked dumpling banana", 2)).toHaveLength(
          2,
        );
      });

      it("does not offer an entry that has no carbohydrate figure", async () => {
        const results = await catalog.search("mystery filling", 10);
        expect(results.map((r) => r.fdc_id)).not.toContain(9002);
      });
    });
  });
}
