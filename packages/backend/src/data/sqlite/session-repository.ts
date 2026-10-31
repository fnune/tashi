import type {
  SessionRepository,
  StoredSession,
} from "../../domain/repositories.js";
import type { Db } from "../database.js";
import { instantOf } from "./columns.js";

export class SqliteSessionRepository implements SessionRepository {
  constructor(private db: Db) {}

  async create(
    tokenHash: Uint8Array,
    session: StoredSession,
    createdAt: Date,
  ): Promise<void> {
    await this.db
      .insertInto("sessions")
      .values({
        token_hash: tokenHash,
        account_id: session.accountId,
        stage: session.stage,
        created_at: instantOf(createdAt),
        expires_at: instantOf(session.expiresAt),
        wrapped_data_key: session.wrappedDataKey,
      })
      .execute();
  }

  async get(tokenHash: Uint8Array): Promise<StoredSession | null> {
    const row = await this.db
      .selectFrom("sessions")
      .select(["account_id", "stage", "expires_at", "wrapped_data_key"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();
    return row
      ? {
          accountId: row.account_id,
          stage: row.stage,
          expiresAt: new Date(row.expires_at),
          wrappedDataKey: row.wrapped_data_key,
        }
      : null;
  }

  async extend(tokenHash: Uint8Array, expiresAt: Date): Promise<void> {
    await this.db
      .updateTable("sessions")
      .set({ expires_at: instantOf(expiresAt) })
      .where("token_hash", "=", tokenHash)
      .execute();
  }

  async deleteExpired(accountId: string, now: Date): Promise<void> {
    await this.db
      .deleteFrom("sessions")
      .where("account_id", "=", accountId)
      .where("expires_at", "<=", instantOf(now))
      .execute();
  }

  async delete(tokenHash: Uint8Array): Promise<void> {
    await this.db
      .deleteFrom("sessions")
      .where("token_hash", "=", tokenHash)
      .execute();
  }
}
