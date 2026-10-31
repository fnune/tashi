import { type Kysely, sql } from "kysely";
import { statementsOf } from "./0001-initial.js";

export const schema = String.raw`
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (name <> '' AND length(name) <= 100),
  name_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TEXT NOT NULL CHECK (created_at IS strftime('%Y-%m-%dT%H:%M:%fZ', created_at))
) STRICT;

CREATE TABLE sign_in_methods (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('password')),
  created_at TEXT NOT NULL CHECK (created_at IS strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  UNIQUE (id, kind)
) STRICT;
CREATE UNIQUE INDEX sign_in_methods_one_password ON sign_in_methods (account_id) WHERE kind = 'password';

CREATE TABLE password_methods (
  method_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'password' CHECK (kind = 'password'),
  salt BLOB NOT NULL CHECK (length(salt) = 16),
  iterations INTEGER NOT NULL CHECK (iterations > 0),
  verifier BLOB NOT NULL CHECK (length(verifier) = 32),
  wrapped_data_key BLOB NOT NULL CHECK (length(wrapped_data_key) > 0),
  FOREIGN KEY (method_id, kind) REFERENCES sign_in_methods (id, kind) ON DELETE CASCADE
) STRICT;

CREATE TABLE sessions (
  token_hash BLOB PRIMARY KEY CHECK (length(token_hash) = 32),
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('second_factor', 'signed_in')),
  created_at TEXT NOT NULL CHECK (created_at IS strftime('%Y-%m-%dT%H:%M:%fZ', created_at)),
  expires_at TEXT NOT NULL CHECK (expires_at IS strftime('%Y-%m-%dT%H:%M:%fZ', expires_at)),
  wrapped_data_key BLOB NOT NULL CHECK (length(wrapped_data_key) > 0)
) STRICT;
CREATE INDEX sessions_by_account ON sessions (account_id);

CREATE TABLE sign_in_failures (
  name_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL CHECK (failures > 0),
  last_failure_at TEXT NOT NULL CHECK (last_failure_at IS strftime('%Y-%m-%dT%H:%M:%fZ', last_failure_at))
) STRICT;
`;

export const statements = statementsOf(schema);

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const statement of statements) {
    await sql.raw(statement).execute(db);
  }
}
