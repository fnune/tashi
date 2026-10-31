import { readCatalogFile } from "../src/data/catalog-file.js";
import { writeAssets } from "../src/data/static-catalog/assets.js";
import { catalogAssets } from "../src/data/static-catalog/build.js";

const [foodsDb, outputDir] = process.argv.slice(2);
if (!foodsDb || !outputDir) {
  console.error("Usage: build-catalog <foods-db> <output-dir>");
  process.exit(1);
}
const build = await readCatalogFile(foodsDb);
const files = catalogAssets(build);
await writeAssets(outputDir, files);
console.log(`Catalog ${build.label}: ${files.size} files in ${outputDir}`);
