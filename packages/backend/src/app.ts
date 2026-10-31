import { Hono } from "hono";
import type { AppConfig } from "./config.js";
import { AnthropicFoodParser } from "./data/anthropic-food-parser.js";
import { ApiKeyStore } from "./domain/api-key-store.js";
import { Calculator } from "./domain/calculator.js";
import type { Clock } from "./domain/clock.js";
import { DiaryImport } from "./domain/diary-import.js";
import { Doses } from "./domain/doses.js";
import type { FoodCatalog } from "./domain/food-catalog.js";
import type { IdGenerator } from "./domain/ids.js";
import {
  anthropicAcceptsKey,
  KeyedFoodParser,
} from "./domain/keyed-food-parser.js";
import type { Repositories } from "./domain/repositories.js";
import { TimelineService } from "./domain/timeline-service.js";
import { passwordGate } from "./http/password-gate.js";
import { createRoutes } from "./http/routes.js";

export interface AppDependencies {
  config: AppConfig;
  repositories: Repositories;
  foodCatalog: FoodCatalog;
  fetch: typeof globalThis.fetch;
  clock: Clock;
  newId: IdGenerator;
}

export function createApp({
  config,
  repositories,
  foodCatalog,
  fetch,
  clock,
  newId,
}: AppDependencies): { app: Hono; apiKeys: ApiKeyStore } {
  const apiKeys = new ApiKeyStore(repositories.apiKey, {
    encryptionSecret: config.encryptionSecret,
    environmentKey: config.anthropicApiKey,
    verify: anthropicAcceptsKey,
  });
  const parser = new KeyedFoodParser(
    apiKeys,
    (apiKey) =>
      new AnthropicFoodParser(apiKey, foodCatalog, fetch, config.model),
  );
  const calculator = new Calculator(parser, foodCatalog, clock, newId);

  const app = new Hono();
  app.get(`${config.basePath}/api/health`, (c) => c.json({ ok: true }));
  if (config.password) app.use("*", passwordGate(config.password));
  app.route(
    config.basePath || "/",
    createRoutes({
      doses: new Doses(repositories, calculator, clock),
      timeline: new TimelineService(repositories, clock, newId),
      diaryImport: new DiaryImport(repositories),
      repositories,
      apiKeys,
      defaultTimeZone: config.defaultTimeZone,
    }),
  );
  return { app, apiKeys };
}
