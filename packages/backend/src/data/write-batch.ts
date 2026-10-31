import type {
  Compilable,
  DeleteQueryNode,
  InsertQueryNode,
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
