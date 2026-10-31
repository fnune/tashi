import { type Kysely, sql } from "kysely";
import { statementsOf } from "./0001-initial.js";

export const schema = String.raw`
CREATE TABLE ai_connections (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('anthropic')),
  model TEXT NOT NULL CHECK (model <> ''),
  created_at TEXT NOT NULL CHECK (created_at IS strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  UNIQUE (id, kind)
) STRICT;
CREATE UNIQUE INDEX ai_connections_one_per_kind ON ai_connections (kind);

CREATE TABLE anthropic_connections (
  connection_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'anthropic' CHECK (kind = 'anthropic'),
  sealed_api_key BLOB NOT NULL CHECK (length(sealed_api_key) > 28),
  FOREIGN KEY (connection_id, kind) REFERENCES ai_connections (id, kind) ON DELETE CASCADE
) STRICT;
`;

export const statements = statementsOf(schema);

// Databases from before this migration kept the API key under a server
// secret instead of the data key; nothing in that table can be opened now.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw("DROP TABLE IF EXISTS anthropic_api_key").execute(db);
  for (const statement of statements) {
    await sql.raw(statement).execute(db);
  }
}
