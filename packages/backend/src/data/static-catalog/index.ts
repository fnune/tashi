import { manifestPath, manifestSchema } from "./layout.js";
import type { ReadAsset } from "./static-food-catalog.js";

export { diskAssets, memoryAssets, writeAssets } from "./assets.js";
export { catalogAssets } from "./build.js";
export { type ReadAsset, StaticFoodCatalog } from "./static-food-catalog.js";

export async function catalogLabel(
  readAsset: ReadAsset,
): Promise<string | null> {
  const manifest = await readAsset(manifestPath);
  return manifest === null ? null : manifestSchema.parse(manifest).label;
}
