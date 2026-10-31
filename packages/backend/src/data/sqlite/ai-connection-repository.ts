import type {
  AiConnectionKind,
  AiConnectionRepository,
  StoredAiConnection,
} from "../../domain/repositories.js";
import type { Db } from "../database.js";
import type { WriteBatch } from "../write-batch.js";
import { instantOf } from "./columns.js";

export class SqliteAiConnectionRepository implements AiConnectionRepository {
  constructor(
    private db: Db,
    private batch: WriteBatch,
  ) {}

  async get(kind: AiConnectionKind): Promise<StoredAiConnection | null> {
    const row = await this.db
      .selectFrom("ai_connections")
      .innerJoin(
        "anthropic_connections",
        "anthropic_connections.connection_id",
        "ai_connections.id",
      )
      .select(["id", "model", "sealed_api_key"])
      .where("ai_connections.kind", "=", kind)
      .executeTakeFirst();
    return row
      ? { id: row.id, kind, model: row.model, sealedApiKey: row.sealed_api_key }
      : null;
  }

  async replace(
    connection: StoredAiConnection,
    createdAt: Date,
  ): Promise<void> {
    await this.batch.write([
      this.db.deleteFrom("ai_connections").where("kind", "=", connection.kind),
      this.db.insertInto("ai_connections").values({
        id: connection.id,
        kind: connection.kind,
        model: connection.model,
        created_at: instantOf(createdAt),
      }),
      this.db.insertInto("anthropic_connections").values({
        connection_id: connection.id,
        sealed_api_key: connection.sealedApiKey,
      }),
    ]);
  }

  async setModel(kind: AiConnectionKind, model: string): Promise<boolean> {
    const result = await this.db
      .updateTable("ai_connections")
      .set({ model })
      .where("kind", "=", kind)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async delete(kind: AiConnectionKind): Promise<void> {
    await this.db
      .deleteFrom("ai_connections")
      .where("kind", "=", kind)
      .execute();
  }
}
