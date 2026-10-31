import type { D1Database } from "@cloudflare/workers-types";
import { Kysely } from "kysely";
import type { IdGenerator } from "../../domain/ids.js";
import type { Repositories } from "../../domain/repositories.js";
import type { Database } from "../database.js";
import { SqliteApiKeyRepository } from "../sqlite/api-key-repository.js";
import { SqliteSettingsRepository } from "../sqlite/settings-repository.js";
import { SqliteTimelineRepository } from "../sqlite/timeline-repository.js";
import { SqliteVocabularyRepository } from "../sqlite/vocabulary-repository.js";
import { D1Dialect } from "./d1-dialect.js";
import { d1WriteBatch } from "./d1-write-batch.js";

export function d1Repositories(
  database: D1Database,
  options: { newId: IdGenerator; catalogRelease: string },
): Repositories {
  const db = new Kysely<Database>({ dialect: new D1Dialect(database) });
  const batch = d1WriteBatch(database);
  return {
    settings: new SqliteSettingsRepository(db, batch, options.newId),
    timeline: new SqliteTimelineRepository(
      db,
      batch,
      options.newId,
      options.catalogRelease,
    ),
    vocabulary: new SqliteVocabularyRepository(db, batch),
    apiKey: new SqliteApiKeyRepository(db),
  };
}
