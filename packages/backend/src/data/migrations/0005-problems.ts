import { type Kysely, sql } from "kysely";
import { statementsOf } from "./0001-initial.js";

export const schema = String.raw`
CREATE TABLE problems (
  id INTEGER PRIMARY KEY,
  occurred_at TEXT NOT NULL CHECK (occurred_at IS strftime('%Y-%m-%dT%H:%M:%fZ', occurred_at)),
  method TEXT NOT NULL CHECK (method <> '' AND length(method) <= 500),
  path TEXT NOT NULL CHECK (length(path) <= 500),
  error TEXT NOT NULL CHECK (length(error) <= 500),
  message TEXT NOT NULL CHECK (length(message) <= 500),
  cause TEXT CHECK (length(cause) <= 500)
) STRICT;
`;

export const statements = statementsOf(schema);

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of statements) {
    await sql.raw(statement).execute(db);
  }
}
