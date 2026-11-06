import { join } from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import { D1Dialect } from "../data/d1/d1-dialect.js";
import { d1WriteBatch } from "../data/d1/d1-write-batch.js";
import { d1Repositories } from "../data/d1/index.js";
import { migrateD1 } from "../data/d1/migrate.js";
import type { Database } from "../data/database.js";
import {
  neverElapses,
  quietObserver,
  recordingLogger,
} from "./recording-logger.js";
import { repositoryContract } from "./repository-contract.js";
import { sequentialIds } from "./sequential-ids.js";
import { writeBatchContract } from "./write-batch-contract.js";

const USER_TABLES = [
  "sessions",
  "sign_in_failures",
  "password_methods",
  "sign_in_methods",
  "accounts",
  "settings",
  "profile_window_ratios",
  "profiles",
  "meal_windows",
  "fast_insulin_entries",
  "meal_entries",
  "glucose_entries",
  "slow_insulin_entries",
  "ratio_versions",
  "catalog_releases",
  "food_vocabulary",
  "anthropic_connections",
  "ai_connections",
  "model_usage",
];

let database: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: join(import.meta.dirname, "d1-wrangler.jsonc"),
    persist: false,
  });
  database = proxy.env.DB;
  dispose = proxy.dispose;
  await migrateD1(database, new Date());
}, 60_000);

afterAll(async () => {
  await dispose();
});

async function emptied(): Promise<D1Database> {
  await database.batch(
    USER_TABLES.map((table) => database.prepare(`DELETE FROM ${table}`)),
  );
  return database;
}

repositoryContract("d1", async () => ({
  repositories: d1Repositories(await emptied(), {
    newId: sequentialIds(1000),
    catalogRelease: "test-release",
    ...quietObserver(),
  }),
  dispose: async () => {},
}));

writeBatchContract("d1", async () => {
  const d1 = await emptied();
  return {
    db: new Kysely<Database>({ dialect: new D1Dialect(d1, quietObserver()) }),
    batch: d1WriteBatch(d1, quietObserver()),
    dispose: async () => {},
  };
});

describe("d1", () => {
  it("applies each migration once, however often it is asked", async () => {
    expect(await migrateD1(database, new Date())).toEqual([]);
    const { results } = await database
      .prepare("SELECT name FROM tashi_migrations")
      .all();
    expect(results).toEqual([
      { name: "0001-initial" },
      { name: "0002-accounts" },
      { name: "0003-model-usage" },
      { name: "0004-ai-connections" },
    ]);
  });

  it("refuses a statement with more parameters than D1 takes, as Cloudflare does", async () => {
    const db = new Kysely<Database>({
      dialect: new D1Dialect(await emptied(), quietObserver()),
    });
    const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
    await expect(
      db
        .selectFrom("glucose_entries")
        .selectAll()
        .where("id", "in", ids)
        .execute(),
    ).rejects.toThrow(/at most 100 parameters/);
  });

  it("logs a slow query without the values bound to it", async () => {
    const { logger, records } = recordingLogger();
    let now = 0;
    const db = new Kysely<Database>({
      dialect: new D1Dialect(await emptied(), {
        logger,
        clock: () => {
          now += 1000;
          return new Date(now);
        },
        startTimer: neverElapses,
      }),
    });
    await db
      .selectFrom("accounts")
      .selectAll()
      .where("id", "=", "a-name-that-must-not-leak")
      .execute();
    expect(records.map((record) => record.event)).toEqual(["d1_query_slow"]);
    expect(JSON.stringify(records)).not.toContain("a-name-that-must-not-leak");
  });
});
