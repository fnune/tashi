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
  "anthropic_api_key",
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
  }),
  dispose: async () => {},
}));

writeBatchContract("d1", async () => {
  const d1 = await emptied();
  return {
    db: new Kysely<Database>({ dialect: new D1Dialect(d1) }),
    batch: d1WriteBatch(d1),
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
    ]);
  });

  it("refuses a statement with more parameters than D1 takes, as Cloudflare does", async () => {
    const db = new Kysely<Database>({
      dialect: new D1Dialect(await emptied()),
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
});
