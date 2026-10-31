import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";
import { openSqliteRepositories } from "./data/sqlite/index.js";
import {
  diskAssets,
  readSearchIndex,
  StaticFoodCatalog,
} from "./data/static-catalog/index.js";
import { systemClock } from "./domain/clock.js";
import { randomId } from "./domain/ids.js";

function configOrExit() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

const config = configOrExit();
const { basePath } = config;

const catalogDir = config.catalogDir ?? join(import.meta.dirname, "../catalog");
const catalogAssets = diskAssets(catalogDir);
const searchIndex = await readSearchIndex(catalogAssets);
if (!searchIndex) {
  console.error(`No food catalog in ${catalogDir}. Run pnpm build:catalog.`);
  process.exit(1);
}
const foodCatalog = new StaticFoodCatalog(searchIndex, catalogAssets);
const { repositories } = await openSqliteRepositories(config.databasePath, {
  newId: randomId,
  catalogRelease: searchIndex.label,
});
console.log(`Food catalog ${searchIndex.label}: ${searchIndex.size} foods`);

const { app, apiKeys } = createApp({
  config,
  repositories,
  foodCatalog,
  fetch,
  clock: systemClock,
  newId: randomId,
});
if (!(await apiKeys.status()).configured) {
  console.warn("No Anthropic API key yet: add one in the settings");
}

if (existsSync("./public")) {
  app.use(
    `${basePath}/*`,
    serveStatic({
      root: "./public",
      rewriteRequestPath: (path) =>
        basePath ? path.replace(basePath, "") : path,
    }),
  );

  app.get(`${basePath}/*`, async (c) => {
    const { readFile } = await import("node:fs/promises");
    const html = await readFile("./public/index.html", "utf-8");
    return c.html(html);
  });
}

console.log(`Listening on http://localhost:${config.port}`);
serve({ fetch: app.fetch, port: config.port });
