import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";
import type { Database } from "../database.js";
import { migrations } from "../migrations/index.js";

export type Db = Kysely<Database>;
export type Executor = Db | Transaction<Database>;

const DATE_OID = 1082;

const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === DATE_OID) return (value: string) => value;
    return pg.types.getTypeParser(oid, format as "text");
  },
};

export function connect(databaseUrl: string): Db {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 10_000,
    types,
  });
  pool.on("error", (error) => {
    console.error("Idle database connection failed:", error.message);
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export async function migrate(db: Db): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}

export async function ensureCatalogRelease(
  db: Db,
  label: string,
): Promise<number> {
  const existing = await db
    .selectFrom("catalog_releases")
    .select("id")
    .where("label", "=", label)
    .executeTakeFirst();
  if (existing) return existing.id;
  const latest = await db
    .selectFrom("catalog_releases")
    .select((eb) => eb.fn.max("id").as("id"))
    .executeTakeFirst();
  const id = (latest?.id ?? 0) + 1;
  await db
    .insertInto("catalog_releases")
    .values({ id, label, imported_at: new Date() })
    .onConflict((oc) => oc.doNothing())
    .execute();
  const stored = await db
    .selectFrom("catalog_releases")
    .select("id")
    .where("label", "=", label)
    .executeTakeFirst();
  if (!stored) throw new Error(`Could not record catalog release ${label}`);
  return stored.id;
}
