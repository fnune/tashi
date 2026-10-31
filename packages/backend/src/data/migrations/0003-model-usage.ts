import { type Kysely, sql } from "kysely";
import { statementsOf } from "./0001-initial.js";

export const schema = String.raw`
CREATE TABLE model_usage (
  id INTEGER PRIMARY KEY,
  used_at TEXT NOT NULL CHECK (used_at IS strftime('%Y-%m-%dT%H:%M:%fZ', used_at)),
  model TEXT NOT NULL CHECK (model <> ''),
  input_tokens INTEGER NOT NULL CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens >= 0),
  cache_write_tokens INTEGER NOT NULL CHECK (cache_write_tokens >= 0),
  cache_read_tokens INTEGER NOT NULL CHECK (cache_read_tokens >= 0)
) STRICT;
CREATE INDEX model_usage_by_time ON model_usage (used_at);
`;

export const statements = statementsOf(schema);

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of statements) {
    await sql.raw(statement).execute(db);
  }
}
