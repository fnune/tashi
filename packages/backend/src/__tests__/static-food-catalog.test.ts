import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diskAssets, writeAssets } from "../data/static-catalog/assets.js";
import { catalogAssets } from "../data/static-catalog/build.js";
import { readSearchIndex } from "../data/static-catalog/index.js";
import { StaticFoodCatalog } from "../data/static-catalog/static-food-catalog.js";
import { foodCatalogContract } from "./food-catalog-contract.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";

foodCatalogContract("static, in memory", async (records) => ({
  catalog: new InMemoryFoodCatalog(records),
  dispose: async () => {},
}));

foodCatalogContract("static, on disk", async (records) => {
  const directory = await mkdtemp(join(tmpdir(), "tashi-catalog-"));
  await writeAssets(directory, catalogAssets({ label: "test", records }));
  const assets = diskAssets(directory);
  const index = await readSearchIndex(assets);
  if (!index) throw new Error("The built catalog has no search index");
  return {
    catalog: new StaticFoodCatalog(index, assets),
    dispose: () => rm(directory, { recursive: true }),
  };
});
