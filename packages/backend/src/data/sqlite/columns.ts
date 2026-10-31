import {
  type Flag,
  type Instant,
  MAX_PARAMETERS_PER_STATEMENT,
} from "../database.js";

export const instantOf = (timestamp: string | Date): Instant =>
  new Date(timestamp).toISOString();

export const flagOf = (value: boolean): Flag => (value ? 1 : 0);

export function inStatements<Row extends object>(rows: Row[]): Row[][] {
  const columns = Math.max(1, ...rows.map((row) => Object.keys(row).length));
  const perStatement = Math.floor(MAX_PARAMETERS_PER_STATEMENT / columns);
  const statements: Row[][] = [];
  for (let start = 0; start < rows.length; start += perStatement) {
    statements.push(rows.slice(start, start + perStatement));
  }
  return statements;
}
