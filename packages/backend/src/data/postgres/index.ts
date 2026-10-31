import type { CatalogBuild, FoodCatalog } from "../../domain/food-catalog.js";
import type { IdGenerator } from "../../domain/ids.js";
import type { Repositories } from "../../domain/repositories.js";
import { PostgresApiKeyRepository } from "./api-key-repository.js";
import { importCatalog } from "./catalog-import.js";
import { connect, migrate, postgresWriteBatch } from "./connection.js";
import { PostgresFoodCatalog } from "./food-catalog.js";
import { PostgresSettingsRepository } from "./settings-repository.js";
import { PostgresTimelineRepository } from "./timeline-repository.js";
import { PostgresVocabularyRepository } from "./vocabulary-repository.js";

export interface OpenedRepositories {
  repositories: Repositories;
  foodCatalog: FoodCatalog;
  close(): Promise<void>;
}

export async function openPostgresRepositories(
  databaseUrl: string,
  options: { newId: IdGenerator; catalog: CatalogBuild },
): Promise<OpenedRepositories> {
  const db = connect(databaseUrl);
  try {
    await migrate(db);
    const release = await importCatalog(db, options.catalog);
    const batch = postgresWriteBatch(db);
    return {
      repositories: {
        settings: new PostgresSettingsRepository(db, batch, options.newId),
        timeline: new PostgresTimelineRepository(
          db,
          batch,
          options.newId,
          release,
        ),
        vocabulary: new PostgresVocabularyRepository(db),
        apiKey: new PostgresApiKeyRepository(db),
      },
      foodCatalog: new PostgresFoodCatalog(db),
      close: () => db.destroy(),
    };
  } catch (error) {
    await db.destroy();
    throw error;
  }
}
