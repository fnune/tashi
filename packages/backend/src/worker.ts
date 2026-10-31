import type { D1Database } from "@cloudflare/workers-types";
import type { Hono } from "hono";
import searchIndexJson from "tashi-search-index";
import { createApp } from "./app.js";
import { loadAppConfig } from "./config.js";
import { d1Repositories } from "./data/d1/index.js";
import {
  type AssetFetcher,
  fetchedAssets,
} from "./data/static-catalog/fetched-assets.js";
import { CATALOG_ASSETS_PATH } from "./data/static-catalog/layout.js";
import { SearchIndex } from "./data/static-catalog/search-index.js";
import { StaticFoodCatalog } from "./data/static-catalog/static-food-catalog.js";
import { systemClock } from "./domain/clock.js";
import { randomId } from "./domain/ids.js";

interface Env extends Record<string, unknown> {
  DB: D1Database;
  ASSETS: AssetFetcher;
}

const searchIndex = SearchIndex.parse(searchIndexJson);

let app: Hono | undefined;

function appFor(env: Env): Hono {
  const { app: built } = createApp({
    config: loadAppConfig(env),
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
  built.all("*", (c) => env.ASSETS.fetch(c.req.raw));
  return built;
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    app ??= appFor(env);
    return app.fetch(request);
  },
};
