import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomId } from "@tashi/backend/ids";
import { openSqliteRepositories } from "@tashi/backend/sqlite";
import {
  diskAssets,
  readSearchIndex,
  StaticFoodCatalog,
} from "@tashi/backend/static-catalog";
import {
  buildTestApp,
  GATE_PASSWORD,
  GATED_PORT,
  OPEN_PORT,
  USER_TABLES,
} from "./test-app.js";

const databaseDir = mkdtempSync(join(tmpdir(), "tashi-e2e-"));
const databasePath = join(databaseDir, "tashi.sqlite");
process.on("exit", () => rmSync(databaseDir, { recursive: true }));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => process.exit(0));
}

const catalogFiles = diskAssets(
  join(import.meta.dirname, "../backend/catalog"),
);
const searchIndex = await readSearchIndex(catalogFiles);
if (!searchIndex) throw new Error("Run pnpm build:catalog in the backend");
const { repositories } = await openSqliteRepositories(databasePath, {
  newId: randomId,
  catalogRelease: searchIndex.label,
});
const sql = new DatabaseSync(databasePath);

for (const [port, password] of [
  [OPEN_PORT, undefined],
  [GATED_PORT, GATE_PASSWORD],
] as const) {
  const app = buildTestApp({
    repositories,
    foodCatalog: new StaticFoodCatalog(searchIndex, catalogFiles),
    timeZone:
      process.env.E2E_TIME_ZONE ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    clearTables: async () => {
      sql.exec(USER_TABLES.map((table) => `DELETE FROM ${table};`).join("\n"));
    },
    password,
  });
  app.use("/*", serveStatic({ root: "../frontend/dist" }));
  app.get("/*", async (c) =>
    c.html(await readFile("../frontend/dist/index.html", "utf-8")),
  );
  serve({ fetch: app.fetch, port });
}
console.log(`Test server listening on http://localhost:${OPEN_PORT}`);
