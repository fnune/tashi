import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Context } from "hono";
import { createApp } from "./app.js";
import {
  SERVER_USAGE,
  ServerOptionsError,
  serverOptions,
  withBaseHref,
} from "./config.js";
import { openSqliteRepositories } from "./data/sqlite/index.js";
import {
  diskAssets,
  readSearchIndex,
  StaticFoodCatalog,
} from "./data/static-catalog/index.js";
import {
  newSetupToken,
  setupTokenWithHash,
} from "./domain/auth/setup-token.js";
import { systemClock } from "./domain/clock.js";
import { randomId } from "./domain/ids.js";
import { structuredLogger } from "./domain/logger.js";
import { setupLinkLines, setupLinkMessage } from "./setup-link.js";

function optionsOrExit() {
  try {
    const options = serverOptions(process.argv.slice(2));
    if (options !== "help") return options;
    console.log(SERVER_USAGE);
    process.exit(0);
  } catch (error) {
    if (!(error instanceof ServerOptionsError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

const config = optionsOrExit();
const { basePath } = config;

const logger = structuredLogger((record) => {
  const line = JSON.stringify({ time: systemClock().toISOString(), ...record });
  if (record.level === "error" || record.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
});

const catalogDir = join(import.meta.dirname, "../catalog");
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
logger.info("catalog_loaded", {
  catalog: searchIndex.label,
  foods: searchIndex.size,
});

const setup = await newSetupToken();
const { app, authentication } = createApp({
  config,
  setupToken: setupTokenWithHash(setup.sha256Hex),
  repositories,
  foodCatalog,
  fetch,
  clock: systemClock,
  newId: randomId,
  logger,
});
if (!(await authentication.isClaimed())) {
  console.log(
    setupLinkMessage([
      ...setupLinkLines(
        `http://localhost:${config.port}${basePath}/setup?token=${setup.token}`,
      ),
      "Behind another address, keep the part from /setup onwards.",
      "",
    ]),
  );
}

if (existsSync("./public")) {
  const page = withBaseHref(
    await readFile("./public/index.html", "utf-8"),
    basePath,
  );
  const servePage = (c: Context) => c.html(page);
  app.get(`${basePath}/`, servePage);
  app.get(`${basePath}/index.html`, servePage);
  app.use(
    `${basePath}/*`,
    serveStatic({
      root: "./public",
      rewriteRequestPath: (path) =>
        basePath ? path.replace(basePath, "") : path,
    }),
  );
  app.get(`${basePath}/*`, servePage);
}

logger.info("listening", { url: `http://localhost:${config.port}${basePath}` });
serve({ fetch: app.fetch, port: config.port });
