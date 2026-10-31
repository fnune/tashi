import { memoryAssets } from "../data/static-catalog/assets.js";
import { catalogAssets } from "../data/static-catalog/build.js";
import { StaticFoodCatalog } from "../data/static-catalog/static-food-catalog.js";
import type { CatalogRecord } from "../domain/food-catalog.js";

export class InMemoryFoodCatalog extends StaticFoodCatalog {
  constructor(records: CatalogRecord[]) {
    super(memoryAssets(catalogAssets({ label: "test", records })));
  }
}
