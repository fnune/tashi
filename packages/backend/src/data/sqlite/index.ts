import type { IdGenerator } from "../../domain/ids.js";
import type { Repositories } from "../../domain/repositories.js";
import { transactionWriteBatch } from "../write-batch.js";
import { SqliteAccountRepository } from "./account-repository.js";
import { SqliteAiConnectionRepository } from "./ai-connection-repository.js";
import { migrate, openSqlite } from "./connection.js";
import { SqliteModelUsageRepository } from "./model-usage-repository.js";
import { SqliteSessionRepository } from "./session-repository.js";
import { SqliteSettingsRepository } from "./settings-repository.js";
import { SqliteSignInFailureRepository } from "./sign-in-failure-repository.js";
import { SqliteTimelineRepository } from "./timeline-repository.js";
import { SqliteVocabularyRepository } from "./vocabulary-repository.js";

export interface OpenedRepositories {
  repositories: Repositories;
  close(): Promise<void>;
}

export async function openSqliteRepositories(
  path: string,
  options: { newId: IdGenerator; catalogRelease: string },
): Promise<OpenedRepositories> {
  const db = openSqlite(path);
  try {
    await migrate(db);
    const batch = transactionWriteBatch(db);
    return {
      repositories: {
        settings: new SqliteSettingsRepository(db, batch, options.newId),
        timeline: new SqliteTimelineRepository(
          db,
          batch,
          options.newId,
          options.catalogRelease,
        ),
        vocabulary: new SqliteVocabularyRepository(db, batch),
        aiConnections: new SqliteAiConnectionRepository(db, batch),
        accounts: new SqliteAccountRepository(db, batch),
        sessions: new SqliteSessionRepository(db),
        signInFailures: new SqliteSignInFailureRepository(db),
        modelUsage: new SqliteModelUsageRepository(db),
      },
      close: () => db.destroy(),
    };
  } catch (error) {
    await db.destroy();
    throw error;
  }
}
