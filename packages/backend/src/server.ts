import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { ConfigError, loadConfig } from "./config.js";
import { AnthropicFoodParser } from "./data/anthropic-food-parser.js";
import { openSqliteRepositories } from "./data/sqlite/index.js";
import {
  diskAssets,
  readSearchIndex,
  StaticFoodCatalog,
} from "./data/static-catalog/index.js";
import { ApiKeyStore } from "./domain/api-key-store.js";
import { Calculator } from "./domain/calculator.js";
import { systemClock } from "./domain/clock.js";
import { DiaryImport } from "./domain/diary-import.js";
import { Doses } from "./domain/doses.js";
import { randomId } from "./domain/ids.js";
import {
  anthropicAcceptsKey,
  KeyedFoodParser,
} from "./domain/keyed-food-parser.js";
import { TimelineService } from "./domain/timeline-service.js";
import { passwordGate } from "./http/password-gate.js";
import { createRoutes } from "./http/routes.js";

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

const apiKeys = new ApiKeyStore(repositories.apiKey, {
  encryptionSecret: config.encryptionSecret,
  environmentKey: config.anthropicApiKey,
  verify: anthropicAcceptsKey,
});
if (!(await apiKeys.status()).configured) {
  console.warn("No Anthropic API key yet: add one in the settings");
}

const parser = new KeyedFoodParser(
  apiKeys,
  (apiKey) => new AnthropicFoodParser(apiKey, foodCatalog, fetch, config.model),
);
const calculator = new Calculator(parser, foodCatalog, systemClock, randomId);

const app = new Hono();

app.get(`${basePath}/api/health`, (c) => c.json({ ok: true }));

if (config.password) {
  app.use("*", passwordGate(config.password));
}

const routes = createRoutes({
  doses: new Doses(repositories, calculator, systemClock),
  timeline: new TimelineService(repositories, systemClock, randomId),
  diaryImport: new DiaryImport(repositories),
  repositories,
  apiKeys,
  defaultTimeZone: config.defaultTimeZone,
});
app.route(basePath || "/", routes);

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
