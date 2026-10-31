import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { SqliteDatabase } from "kysely";

export function nodeSqlite(path: string): SqliteDatabase {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  return {
    close: () => database.close(),
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        reader: statement.columns().length > 0,
        all: (parameters) => statement.all(...parameters.map(sqlValue)),
        run: (parameters) => statement.run(...parameters.map(sqlValue)),
        iterate: (parameters) => statement.iterate(...parameters.map(sqlValue)),
      };
    },
  };
}

function sqlValue(value: unknown): SQLInputValue {
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "string" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  throw new TypeError(`SQLite cannot store ${typeof value} ${String(value)}`);
}
