import type { D1Database } from "@cloudflare/workers-types";
import { migrationStatements } from "../migrations/index.js";

export async function migrateD1(
  database: D1Database,
  appliedAt: Date,
): Promise<string[]> {
  await database
    .prepare(
      "CREATE TABLE IF NOT EXISTS tashi_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT",
    )
    .run();
  const { results } = await database
    .prepare("SELECT name FROM tashi_migrations")
    .all<{ name: string }>();
  const applied = new Set(results.map((row) => row.name));
  const pending = migrationStatements.filter((m) => !applied.has(m.name));
  for (const migration of pending) {
    await database.batch([
      ...migration.statements.map((statement) => database.prepare(statement)),
      database
        .prepare(
          "INSERT INTO tashi_migrations (name, applied_at) VALUES (?, ?)",
        )
        .bind(migration.name, appliedAt.toISOString()),
    ]);
  }
  return pending.map((migration) => migration.name);
}
