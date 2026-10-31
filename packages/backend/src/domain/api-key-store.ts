import type { ApiKeyStatus } from "@tashi/shared";
import { InvalidApiKeyError, SecretUnavailableError } from "./errors.js";
import type { ApiKeyRepository } from "./repositories.js";
import { seal, unseal } from "./secret-box.js";

export interface ApiKeyStoreOptions {
  encryptionSecret?: string;
  environmentKey?: string;
  verify?: (apiKey: string) => Promise<boolean>;
}

export class ApiKeyStore {
  private decryptedKey: string | null | undefined;

  constructor(
    private records: ApiKeyRepository,
    private options: ApiKeyStoreOptions = {},
  ) {}

  async get(): Promise<string | null> {
    return (await this.stored()) ?? this.options.environmentKey ?? null;
  }

  async status(): Promise<ApiKeyStatus> {
    const can_save = this.options.encryptionSecret !== undefined;
    if ((await this.stored()) !== null) {
      return { configured: true, source: "settings", can_save };
    }
    if (this.options.environmentKey) {
      return { configured: true, source: "environment", can_save };
    }
    return { configured: false, source: null, can_save };
  }

  async save(apiKey: string): Promise<void> {
    const { encryptionSecret, verify } = this.options;
    if (encryptionSecret === undefined) throw new SecretUnavailableError();
    if (verify && !(await verify(apiKey))) throw new InvalidApiKeyError();
    await this.records.save(await seal(apiKey, encryptionSecret));
    this.decryptedKey = apiKey;
  }

  async clear(): Promise<void> {
    await this.records.delete();
    this.decryptedKey = null;
  }

  private async stored(): Promise<string | null> {
    if (this.decryptedKey !== undefined) return this.decryptedKey;
    const record = await this.records.get();
    const { encryptionSecret } = this.options;
    this.decryptedKey =
      record && encryptionSecret !== undefined
        ? await unseal(record, encryptionSecret)
        : null;
    return this.decryptedKey;
  }
}
