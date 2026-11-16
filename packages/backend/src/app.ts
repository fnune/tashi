import { Hono } from "hono";
import type { AppConfig } from "./config.js";
import { AnthropicFoodParser } from "./data/anthropic-food-parser.js";
import { AiConnections } from "./domain/ai-connections.js";
import {
  Authentication,
  type SetupToken,
} from "./domain/auth/authentication.js";
import { Calculator } from "./domain/calculator.js";
import type { Clock } from "./domain/clock.js";
import { DiaryImport } from "./domain/diary-import.js";
import type { FoodCatalog } from "./domain/food-catalog.js";
import type { IdGenerator } from "./domain/ids.js";
import { InsulinUnits } from "./domain/insulin-units.js";
import {
  anthropicAcceptsKey,
  KeyedFoodParser,
} from "./domain/keyed-food-parser.js";
import type { Logger } from "./domain/logger.js";
import { MeteredFoodParser } from "./domain/model-usage.js";
import { ProblemLog } from "./domain/problems.js";
import type { Repositories } from "./domain/repositories.js";
import { TimelineService } from "./domain/timeline-service.js";
import { authenticate, type SignedIn } from "./http/authentication.js";
import { logRequests, respondToErrors } from "./http/logging.js";
import { createRoutes } from "./http/routes.js";

export interface AppDependencies {
  config: AppConfig;
  setupToken: SetupToken;
  repositories: Repositories;
  foodCatalog: FoodCatalog;
  fetch: typeof globalThis.fetch;
  clock: Clock;
  newId: IdGenerator;
  logger: Logger;
}

export const PASSWORD_ITERATIONS = 30_000;

export function createApp({
  config,
  setupToken,
  repositories,
  foodCatalog,
  fetch,
  clock,
  newId,
  logger,
}: AppDependencies): {
  app: Hono<SignedIn>;
  authentication: Authentication;
} {
  const aiConnections = new AiConnections(repositories.aiConnections, {
    kind: "anthropic",
    clock,
    newId,
    verify: anthropicAcceptsKey,
  });
  const parser = new KeyedFoodParser(
    new AnthropicFoodParser(foodCatalog, fetch),
  );
  const calculator = new Calculator(
    new MeteredFoodParser(parser, repositories.modelUsage, clock),
    foodCatalog,
    clock,
    newId,
  );

  const authentication = new Authentication({
    accounts: repositories.accounts,
    sessions: repositories.sessions,
    signInFailures: repositories.signInFailures,
    setupToken,
    clock,
    newId,
    passwordIterations: PASSWORD_ITERATIONS,
  });

  const problems = new ProblemLog(repositories.problems, clock);
  const app = new Hono<SignedIn>();
  app.onError(respondToErrors(logger, problems));
  app.use(`${config.basePath}/api/*`, logRequests(logger, clock));
  authenticate(app, authentication, config.basePath, logger);
  app.get(`${config.basePath}/api/health`, (c) => c.json({ ok: true }));
  app.route(
    config.basePath || "/",
    createRoutes({
      insulinUnits: new InsulinUnits(repositories, calculator, clock),
      timeline: new TimelineService(repositories, clock, newId),
      diaryImport: new DiaryImport(repositories),
      repositories,
      aiConnections,
      defaultTimeZone: "UTC",
      logger,
      problems,
    }),
  );
  return { app, authentication };
}
