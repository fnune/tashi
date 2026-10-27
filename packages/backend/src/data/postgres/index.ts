import type { IdGenerator } from "../../domain/ids.js";
import type { Repositories } from "../../domain/repositories.js";
import { PostgresApiKeyRepository } from "./api-key-repository.js";
import { connect, ensureCatalogRelease, migrate } from "./connection.js";
import { PostgresSettingsRepository } from "./settings-repository.js";
import { PostgresTimelineRepository } from "./timeline-repository.js";
import { PostgresVocabularyRepository } from "./vocabulary-repository.js";

export interface OpenedRepositories {
  repositories: Repositories;
  close(): Promise<void>;
}

export async function openPostgresRepositories(
  databaseUrl: string,
  options: { newId: IdGenerator; catalogRelease: string },
): Promise<OpenedRepositories> {
  const db = connect(databaseUrl);
  try {
    await migrate(db);
    const release = await ensureCatalogRelease(db, options.catalogRelease);
    return {
      repositories: {
        settings: new PostgresSettingsRepository(db, options.newId),
        timeline: new PostgresTimelineRepository(db, options.newId, release),
        vocabulary: new PostgresVocabularyRepository(db),
        apiKey: new PostgresApiKeyRepository(db),
      },
      close: () => db.destroy(),
    };
  } catch (error) {
    await db.destroy();
    throw error;
  }
}
