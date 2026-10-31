import { memoryAssets } from "../data/static-catalog/assets.js";
import { catalogAssets } from "../data/static-catalog/build.js";
import { searchIndexPath } from "../data/static-catalog/layout.js";
import { SearchIndex } from "../data/static-catalog/search-index.js";
import { StaticFoodCatalog } from "../data/static-catalog/static-food-catalog.js";
import type { CatalogRecord } from "../domain/food-catalog.js";

export class InMemoryFoodCatalog extends StaticFoodCatalog {
  constructor(records: CatalogRecord[]) {
    const files = catalogAssets({ label: "test", records });
    super(
      SearchIndex.parse(structuredClone(files.get(searchIndexPath))),
      memoryAssets(files),
    );
  }
}
