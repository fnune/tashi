import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import {
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type Kysely,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
} from "kysely";
import { MAX_PARAMETERS_PER_STATEMENT } from "../database.js";
import { type QueryObserver, timedQuery } from "./timed-query.js";

export class D1Dialect implements Dialect {
  constructor(
    private database: D1Database,
    private observer: QueryObserver,
  ) {}

  createAdapter() {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new D1Driver(this.database, this.observer);
  }

  createIntrospector(db: Kysely<unknown>) {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler() {
    return new SqliteQueryCompiler();
  }
}

export function prepared(
  database: D1Database,
  query: CompiledQuery,
): D1PreparedStatement {
  if (query.parameters.length > MAX_PARAMETERS_PER_STATEMENT) {
    throw new RangeError(
      `D1 takes at most ${MAX_PARAMETERS_PER_STATEMENT} parameters per statement; this one has ${query.parameters.length}: ${query.sql.slice(0, 80)}`,
    );
  }
  return database.prepare(query.sql).bind(...query.parameters);
}

export function rowWithBytes(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      Array.isArray(value) ? Uint8Array.from(value) : value,
    ]),
  );
}

class D1Driver implements Driver {
  constructor(
    private database: D1Database,
    private observer: QueryObserver,
  ) {}

  async init() {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection(this.database, this.observer);
  }

  async beginTransaction(): Promise<void> {
    throw new Error("D1 has no interactive transactions: use a WriteBatch");
  }

  async commitTransaction(): Promise<void> {}

  async rollbackTransaction(): Promise<void> {}

  async releaseConnection() {}

  async destroy() {}
}

class D1Connection implements DatabaseConnection {
  constructor(
    private database: D1Database,
    private observer: QueryObserver,
  ) {}

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    const statement = prepared(this.database, query);
    const result = await timedQuery(this.observer, query.sql, () =>
      statement.all(),
    );
    return {
      rows: result.results.map(rowWithBytes) as R[],
      numAffectedRows: BigInt(result.meta.changes ?? 0),
    };
  }

  streamQuery(): never {
    throw new Error("D1 cannot stream query results");
  }
}
