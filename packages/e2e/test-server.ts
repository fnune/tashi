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
import { portsOf } from "./ports.js";
import { buildTestApp, USER_TABLES } from "./test-app.js";

const catalogFiles = diskAssets(
  join(import.meta.dirname, "../backend/catalog"),
);
const builtIndex = await readSearchIndex(catalogFiles);
if (!builtIndex) throw new Error("Run pnpm build:catalog in the backend");
const searchIndex = builtIndex;
const timeZone =
  process.env.E2E_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

const databaseDir = mkdtempSync(join(tmpdir(), "tashi-e2e-"));
process.on("exit", () => rmSync(databaseDir, { recursive: true }));
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => process.exit(0));
}

async function serveSlot(slot: number): Promise<void> {
  const databasePath = join(databaseDir, `tashi-${slot}.sqlite`);
  const { repositories } = await openSqliteRepositories(databasePath, {
    newId: randomId,
    catalogRelease: searchIndex.label,
  });
  const sql = new DatabaseSync(databasePath);
  const ports = portsOf(slot);
  for (const [port, withAccounts] of [
    [ports.open, false],
    [ports.gated, true],
  ] as const) {
    const app = buildTestApp({
      repositories,
      foodCatalog: new StaticFoodCatalog(searchIndex, catalogFiles),
      timeZone,
      clearTables: async () => {
        sql.exec(
          USER_TABLES.map((table) => `DELETE FROM ${table};`).join("\n"),
        );
      },
      withAccounts,
    });
    app.use("/*", serveStatic({ root: "../frontend/dist" }));
    app.get("/*", async (c) =>
      c.html(await readFile("../frontend/dist/index.html", "utf-8")),
    );
    serve({ fetch: app.fetch, port });
  }
}

const slots = Number(process.argv[2] ?? 1);
for (let slot = 0; slot < slots; slot++) await serveSlot(slot);
console.log(`Test servers listening for ${slots} workers`);
