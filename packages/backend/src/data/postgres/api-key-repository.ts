import type { ApiKeyRepository } from "../../domain/repositories.js";
import { sealedSecretSchema } from "../../domain/schemas.js";
import type { SealedSecret } from "../../domain/secret-box.js";
import { StoredDataError } from "../stored-data-error.js";
import type { Db } from "./connection.js";

export class PostgresApiKeyRepository implements ApiKeyRepository {
  constructor(private db: Db) {}

  async get(): Promise<SealedSecret | null> {
    const row = await this.db
      .selectFrom("anthropic_api_key")
      .selectAll()
      .executeTakeFirst();
    if (!row) return null;
    try {
      return sealedSecretSchema.parse({
        salt: row.salt.toString("base64"),
        iv: row.iv.toString("base64"),
        tag: row.auth_tag.toString("base64"),
        data: row.ciphertext.toString("base64"),
      });
    } catch (e) {
      throw new StoredDataError("anthropic_api_key", e);
    }
  }

  async save(record: SealedSecret): Promise<void> {
    const columns = {
      salt: Buffer.from(record.salt, "base64"),
      iv: Buffer.from(record.iv, "base64"),
      auth_tag: Buffer.from(record.tag, "base64"),
      ciphertext: Buffer.from(record.data, "base64"),
    };
    await this.db
      .insertInto("anthropic_api_key")
      .values({ singleton: true, ...columns })
      .onConflict((oc) => oc.column("singleton").doUpdateSet(columns))
      .execute();
  }

  async delete(): Promise<void> {
    await this.db.deleteFrom("anthropic_api_key").execute();
  }
}
