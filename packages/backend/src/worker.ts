import type { D1Database } from "@cloudflare/workers-types";
import { Hono } from "hono";
import searchIndexJson from "tashi-search-index";
import { createApp } from "./app.js";
import { type AppConfig, ConfigError, loadAppConfig } from "./config.js";
import { d1Repositories } from "./data/d1/index.js";
import { migrateD1 } from "./data/d1/migrate.js";
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

let ready: Promise<Hono> | undefined;

async function start(env: Env): Promise<Hono> {
  let config: AppConfig;
  try {
    config = loadAppConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return setupPage(error.message);
    throw error;
  }
  if (!config.password) return setupPage(PASSWORD_MISSING);
  await migrateD1(env.DB, systemClock());
  const { app } = createApp({
    config,
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

const PASSWORD_MISSING =
  "Tashi is installed but has no password yet, so it shows nothing. In the Cloudflare dashboard, open this Worker, go to Settings, then Variables and Secrets, and add a secret named TASHI_PASSWORD. Tashi starts as soon as it is saved.";

function setupPage(problem: string): Hono {
  const page = new Hono();
  page.all("*", (c) =>
    c.html(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tashi</title><main style="font-family: system-ui; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5"><h1>Tashi needs one more step</h1><p>${escapeHtml(problem)}</p></main>`,
      503,
    ),
  );
  return page;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
