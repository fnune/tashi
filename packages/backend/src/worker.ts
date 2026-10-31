import type { D1Database } from "@cloudflare/workers-types";
import type { Hono } from "hono";
import searchIndexJson from "tashi-search-index";
import setupTokenJson from "tashi-setup-token";
import { z } from "zod";
import { createApp } from "./app.js";
import { d1Repositories } from "./data/d1/index.js";
import { migrateD1 } from "./data/d1/migrate.js";
import {
  type AssetFetcher,
  fetchedAssets,
} from "./data/static-catalog/fetched-assets.js";
import { CATALOG_ASSETS_PATH } from "./data/static-catalog/layout.js";
import { SearchIndex } from "./data/static-catalog/search-index.js";
import { StaticFoodCatalog } from "./data/static-catalog/static-food-catalog.js";
import { setupTokenWithHash } from "./domain/auth/setup-token.js";
import { systemClock } from "./domain/clock.js";
import { randomId } from "./domain/ids.js";
import type { SignedIn } from "./http/authentication.js";

interface Env {
  DB: D1Database;
  ASSETS: AssetFetcher;
}

const searchIndex = SearchIndex.parse(searchIndexJson);

const setupTokenHash = z
  .object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) })
  .parse(setupTokenJson).sha256;

let ready: Promise<Hono<SignedIn>> | undefined;

async function start(env: Env): Promise<Hono<SignedIn>> {
  await migrateD1(env.DB, systemClock());
  const { app } = createApp({
    config: { basePath: "" },
    setupToken: setupTokenWithHash(setupTokenHash),
    repositories: d1Repositories(env.DB, {
      newId: randomId,
      catalogRelease: searchIndex.label,
    }),
    foodCatalog: new StaticFoodCatalog(
      searchIndex,
      fetchedAssets(env.ASSETS, CATALOG_ASSETS_PATH),
    ),
    fetch: (input, init) => fetch(input, init),
    clock: systemClock,
    newId: randomId,
  });
  app.all("*", (c) => env.ASSETS.fetch(c.req.raw));
  return app;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    ready ??= start(env).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return (await ready).fetch(request);
  },
};
