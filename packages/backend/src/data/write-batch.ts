import type {
  Compilable,
  DeleteQueryNode,
  InsertQueryNode,
  Kysely,
  UpdateQueryNode,
} from "kysely";

export interface WriteQuery extends Compilable {
  toOperationNode(): InsertQueryNode | UpdateQueryNode | DeleteQueryNode;
}

export interface WriteResult {
  affectedRows: number;
}

export interface WriteBatch {
  write(queries: readonly WriteQuery[]): Promise<WriteResult[]>;
}

export function transactionWriteBatch<DB>(db: Kysely<DB>): WriteBatch {
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
