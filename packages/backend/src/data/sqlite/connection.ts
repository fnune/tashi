import { Kysely, SqliteDialect } from "kysely";
import { Migrator } from "kysely/migration";
import type { Database, Db } from "../database.js";
import { migrations } from "../migrations/index.js";
import { nodeSqlite } from "./node-sqlite.js";

export function openSqlite(path: string): Db {
  return new Kysely<Database>({
    dialect: new SqliteDialect({ database: nodeSqlite(path) }),
  });
}

export async function migrate(db: Db): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
