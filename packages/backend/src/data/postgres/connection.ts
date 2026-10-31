import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";
import type { Database } from "../database.js";
import { migrations } from "../migrations/index.js";
import type { WriteBatch, WriteResult } from "../write-batch.js";

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

export function postgresWriteBatch(db: Db): WriteBatch {
  return {
    write: (queries) =>
      db.transaction().execute(async (trx) => {
        const results: WriteResult[] = [];
        for (const query of queries) {
          const result = await trx.executeQuery(query.compile());
          results.push({ affectedRows: Number(result.numAffectedRows ?? 0n) });
        }
        return results;
      }),
  };
}
