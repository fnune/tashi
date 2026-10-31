import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diskAssets, writeAssets } from "../data/static-catalog/assets.js";
import { catalogAssets } from "../data/static-catalog/build.js";
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
  return {
    catalog: new StaticFoodCatalog(diskAssets(directory)),
    dispose: () => rm(directory, { recursive: true }),
  };
});
