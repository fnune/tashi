import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { CATALOG_ASSETS_PATH } from "../src/data/static-catalog/layout.js";

const [frontendDist, catalogDir, outputDir] = process.argv.slice(2);
if (!frontendDist || !catalogDir || !outputDir) {
  console.error(
    "Usage: build-worker-assets <frontend-dist> <catalog-dir> <output-dir>",
  );
  process.exit(1);
}
await rm(outputDir, { recursive: true, force: true });
await cp(frontendDist, outputDir, { recursive: true });
await cp(
  join(catalogDir, "entries"),
  join(outputDir, CATALOG_ASSETS_PATH, "entries"),
  { recursive: true },
);
console.log(`Worker assets in ${outputDir}`);
