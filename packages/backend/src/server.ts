import { existsSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { AnthropicFoodParser } from "./anthropic-food-parser.js";
import { ApiKeyStore } from "./api-key-store.js";
import { Calculator } from "./calculator.js";
import { systemClock } from "./clock.js";
import { loadConfig } from "./config.js";
import { FoodDatabase } from "./db/food-db.js";
import { openFileRepositories } from "./file-repositories.js";
import { randomId } from "./ids.js";
import { anthropicAcceptsKey, KeyedFoodParser } from "./keyed-food-parser.js";
import { passwordGate } from "./password-gate.js";
import { createRoutes } from "./routes.js";

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
  calculator,
  repositories,
  apiKeys,
  clock: systemClock,
  newId: randomId,
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
