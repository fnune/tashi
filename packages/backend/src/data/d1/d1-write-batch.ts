import type { D1Database } from "@cloudflare/workers-types";
import type { WriteBatch } from "../write-batch.js";
import { prepared } from "./d1-dialect.js";
import { type QueryObserver, timedQuery } from "./timed-query.js";

export function d1WriteBatch(
  database: D1Database,
  observer: QueryObserver,
): WriteBatch {
  return {
    async write(queries) {
      if (queries.length === 0) return [];
      const compiled = queries.map((query) => query.compile());
      const statements = compiled.map((query) => prepared(database, query));
      const results = await timedQuery(
        observer,
        `batch of ${compiled.length}: ${compiled.map((query) => query.sql).join("; ")}`,
        () => database.batch(statements),
      );
      return results.map((result) => ({
        affectedRows: result.meta.changes ?? 0,
      }));
    },
  };
}
