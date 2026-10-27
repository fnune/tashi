declare module "sql.js" {
  interface SqlJsStatic {
    Database: {
      new (): Database;
      new (data: ArrayLike<number>): Database;
    };
  }

  interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  interface Statement {
    bind(params?: Record<string, unknown> | unknown[]): boolean;
    step(): boolean;
    getAsObject(params?: Record<string, unknown>): Record<string, unknown>;
    free(): boolean;
    reset(): void;
  }

  interface Database {
    run(sql: string, params?: Record<string, unknown> | unknown[]): Database;
    exec(sql: string, params?: Record<string, unknown>): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }

  interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
    wasmBinary?: ArrayLike<number>;
  }

  export default function initSqlJs(
    options?: InitSqlJsOptions,
  ): Promise<SqlJsStatic>;
}
