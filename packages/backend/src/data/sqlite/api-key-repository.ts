import type { ApiKeyRepository } from "../../domain/repositories.js";
import { sealedSecretSchema } from "../../domain/schemas.js";
import {
  fromBase64,
  type SealedSecret,
  toBase64,
} from "../../domain/secret-box.js";
import type { Db } from "../database.js";
import { StoredDataError } from "../stored-data-error.js";

export class SqliteApiKeyRepository implements ApiKeyRepository {
  constructor(private db: Db) {}

  async get(): Promise<SealedSecret | null> {
    const row = await this.db
      .selectFrom("anthropic_api_key")
      .selectAll()
      .executeTakeFirst();
    if (!row) return null;
    try {
      return sealedSecretSchema.parse({
        salt: toBase64(row.salt),
        iv: toBase64(row.iv),
        tag: toBase64(row.auth_tag),
        data: toBase64(row.ciphertext),
      });
    } catch (e) {
      throw new StoredDataError("anthropic_api_key", e);
    }
  }

  async save(record: SealedSecret): Promise<void> {
    const columns = {
      salt: fromBase64(record.salt),
      iv: fromBase64(record.iv),
      auth_tag: fromBase64(record.tag),
      ciphertext: fromBase64(record.data),
    };
    await this.db
      .insertInto("anthropic_api_key")
      .values({ singleton: 1, ...columns })
      .onConflict((oc) => oc.column("singleton").doUpdateSet(columns))
      .execute();
  }

  async delete(): Promise<void> {
    await this.db.deleteFrom("anthropic_api_key").execute();
  }
}
