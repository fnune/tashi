import { foodCatalogContract } from "./food-catalog-contract.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";

foodCatalogContract("in-memory", async (records) => ({
  catalog: new InMemoryFoodCatalog(records),
  dispose: async () => {},
}));
