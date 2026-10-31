import type { D1Database } from "@cloudflare/workers-types";
import type { SignedIn } from "@tashi/backend/authenticate";
import { CATALOG_ASSETS_PATH } from "@tashi/backend/catalog-layout";
import { d1Repositories } from "@tashi/backend/d1";
import { migrateD1 } from "@tashi/backend/d1-migrate";
import {
  type AssetFetcher,
  fetchedAssets,
} from "@tashi/backend/fetched-assets";
import { randomId } from "@tashi/backend/ids";
import { SearchIndex } from "@tashi/backend/search-index";
import { StaticFoodCatalog } from "@tashi/backend/static-food-catalog";
import type { Hono } from "hono";
import searchIndexJson from "tashi-search-index";
import { buildTestApp, USER_TABLES } from "./test-app.js";

interface Env {
  DB: D1Database;
  ASSETS: AssetFetcher;
  E2E_TIME_ZONE: string;
  E2E_WITH_ACCOUNTS?: string;
}

const searchIndex = SearchIndex.parse(searchIndexJson);
let ready: Promise<Hono<SignedIn>> | undefined;

function appFor(env: Env): Hono<SignedIn> {
  const built = buildTestApp({
    repositories: d1Repositories(env.DB, {
      newId: randomId,
      catalogRelease: searchIndex.label,
    }),
    foodCatalog: new StaticFoodCatalog(
      searchIndex,
      fetchedAssets(env.ASSETS, CATALOG_ASSETS_PATH),
    ),
    timeZone: env.E2E_TIME_ZONE,
    clearTables: async () => {
      await env.DB.batch(
        USER_TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
      );
    },
    withAccounts: env.E2E_WITH_ACCOUNTS === "yes",
  });
  built.all("*", (c) => env.ASSETS.fetch(c.req.raw));
  return built;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    ready ??= migrateD1(env.DB, new Date()).then(() => appFor(env));
    return (await ready).fetch(request);
  },
};
