import type { D1Database } from "@cloudflare/workers-types";
import type { WriteBatch } from "../write-batch.js";
import { prepared } from "./d1-dialect.js";

export function d1WriteBatch(database: D1Database): WriteBatch {
  return {
    async write(queries) {
      if (queries.length === 0) return [];
      const results = await database.batch(
        queries.map((query) => prepared(database, query.compile())),
      );
      return results.map((result) => ({
        affectedRows: result.meta.changes ?? 0,
      }));
    },
  };
}
