import type { D1Database } from "@cloudflare/workers-types";
import type { Hono } from "hono";
import searchIndexJson from "tashi-search-index";
import setupTokenJson from "tashi-setup-token";
import { z } from "zod";
import { createApp } from "./app.js";
import { d1Repositories } from "./data/d1/index.js";
import { migrateD1 } from "./data/d1/migrate.js";
import { timedQuery } from "./data/d1/timed-query.js";
import {
  type AssetFetcher,
  fetchedAssets,
} from "./data/static-catalog/fetched-assets.js";
import { CATALOG_ASSETS_PATH } from "./data/static-catalog/layout.js";
import { SearchIndex } from "./data/static-catalog/search-index.js";
import { StaticFoodCatalog } from "./data/static-catalog/static-food-catalog.js";
import { setupTokenWithHash } from "./domain/auth/setup-token.js";
import { systemClock, systemTimer } from "./domain/clock.js";
import { randomId } from "./domain/ids.js";
import {
  errorFields,
  type LogRecord,
  structuredLogger,
} from "./domain/logger.js";
import type { SignedIn } from "./http/authentication.js";

interface Env {
  DB: D1Database;
  ASSETS: AssetFetcher;
}

const searchIndex = SearchIndex.parse(searchIndexJson);

const setupTokenHash = z
  .object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) })
  .parse(setupTokenJson).sha256;

const logger = structuredLogger((record: LogRecord) => {
  console[record.level](record);
});

let ready: Promise<Hono<SignedIn>> | undefined;

async function start(env: Env): Promise<Hono<SignedIn>> {
  const observer = { logger, clock: systemClock, startTimer: systemTimer };
  const migrations = await timedQuery(observer, "migrations", () =>
    migrateD1(env.DB, systemClock()),
  );
  logger.info("started", {
    migrations_applied: migrations.join(", ") || null,
    catalog: searchIndex.label,
  });
  const { app } = createApp({
    config: { basePath: "" },
    setupToken: setupTokenWithHash(setupTokenHash),
    repositories: d1Repositories(env.DB, {
      newId: randomId,
      catalogRelease: searchIndex.label,
      ...observer,
    }),
    foodCatalog: new StaticFoodCatalog(
      searchIndex,
      fetchedAssets(env.ASSETS, CATALOG_ASSETS_PATH),
    ),
    fetch: (input, init) => fetch(input, init),
    clock: systemClock,
    newId: randomId,
    logger,
  });
  app.all("*", (c) => env.ASSETS.fetch(c.req.raw));
  return app;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    ready ??= start(env).catch((error: unknown) => {
      logger.error("start_failed", errorFields(error));
      ready = undefined;
      throw error;
    });
    return (await ready).fetch(request);
  },
};
