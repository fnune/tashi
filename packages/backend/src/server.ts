import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { AnthropicFoodParser } from "./data/anthropic-food-parser.js";
import { openFileRepositories } from "./data/file-repositories.js";
import { FoodDatabase } from "./data/food-db.js";
import { ApiKeyStore } from "./domain/api-key-store.js";
import { Calculator } from "./domain/calculator.js";
import { systemClock } from "./domain/clock.js";
import { Doses } from "./domain/doses.js";
import { randomId } from "./domain/ids.js";
import {
  anthropicAcceptsKey,
  KeyedFoodParser,
} from "./domain/keyed-food-parser.js";
import { TimelineService } from "./domain/timeline-service.js";
import { passwordGate } from "./http/password-gate.js";
import { createRoutes } from "./http/routes.js";

const config = loadConfig(process.env);
const foodsDbPath =
  config.foodsDbPath ?? join(import.meta.dirname, "../../../data/foods.db");
const { basePath } = config;

const repositories = await openFileRepositories(config.dataDir);

const foodDb = await FoodDatabase.open(foodsDbPath);
console.log(`Food database loaded: ${foodDb.foodCount()} foods`);

const apiKeys = new ApiKeyStore(repositories.apiKey, {
  encryptionPassphrase: config.encryptionPassphrase,
  environmentKey: config.anthropicApiKey,
  verify: anthropicAcceptsKey,
});
if (!(await apiKeys.status()).configured) {
  console.warn("No Anthropic API key yet: add one in the settings");
}

const parser = new KeyedFoodParser(
  apiKeys,
  (apiKey) => new AnthropicFoodParser(apiKey, foodDb, config.model),
);
const calculator = new Calculator(parser, foodDb, systemClock, randomId);

const app = new Hono();

app.get(`${basePath}/api/health`, (c) => c.json({ ok: true }));

if (config.password) {
  app.use("*", passwordGate(config.password));
}

const routes = createRoutes({
  doses: new Doses(repositories, calculator, systemClock),
  timeline: new TimelineService(repositories, systemClock, randomId),
  repositories,
  apiKeys,
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
