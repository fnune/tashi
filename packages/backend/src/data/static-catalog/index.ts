import { searchIndexPath } from "./layout.js";
import { SearchIndex } from "./search-index.js";
import type { ReadAsset } from "./static-food-catalog.js";

export { diskAssets, memoryAssets, writeAssets } from "./assets.js";
export { catalogAssets } from "./build.js";
export { SearchIndex } from "./search-index.js";
export { type ReadAsset, StaticFoodCatalog } from "./static-food-catalog.js";

export async function readSearchIndex(
  readAsset: ReadAsset,
): Promise<SearchIndex | null> {
  const content = await readAsset(searchIndexPath);
  return content === null ? null : SearchIndex.parse(content);
}
