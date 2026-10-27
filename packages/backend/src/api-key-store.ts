import type { ApiKeyStatus } from "@tashi/shared";
import { InvalidApiKeyError, SecretUnavailableError } from "./errors.js";
import { type SealedSecret, seal, unseal } from "./secret-box.js";

export interface ApiKeyRecords {
  getApiKeyRecord(): Promise<SealedSecret | null>;
  saveApiKeyRecord(record: SealedSecret): Promise<void>;
  deleteApiKeyRecord(): Promise<void>;
}

export interface ApiKeyStoreOptions {
  encryptionPassphrase?: string;
  environmentKey?: string;
  verify?: (apiKey: string) => Promise<boolean>;
}

export class ApiKeyStore {
  private decryptedKey: string | null | undefined;

  constructor(
    private records: ApiKeyRecords,
    private options: ApiKeyStoreOptions = {},
  ) {}

  async get(): Promise<string | null> {
    return (await this.stored()) ?? this.options.environmentKey ?? null;
  }

  async status(): Promise<ApiKeyStatus> {
    const can_save = this.options.encryptionPassphrase !== undefined;
    if ((await this.stored()) !== null) {
      return { configured: true, source: "settings", can_save };
    }
    if (this.options.environmentKey) {
      return { configured: true, source: "environment", can_save };
    }
    return { configured: false, source: null, can_save };
  }

  async save(apiKey: string): Promise<void> {
    const { encryptionPassphrase, verify } = this.options;
    if (encryptionPassphrase === undefined) throw new SecretUnavailableError();
    if (verify && !(await verify(apiKey))) throw new InvalidApiKeyError();
    await this.records.saveApiKeyRecord(seal(apiKey, encryptionPassphrase));
    this.decryptedKey = apiKey;
  }

  async clear(): Promise<void> {
    await this.records.deleteApiKeyRecord();
    this.decryptedKey = null;
  }

  private async stored(): Promise<string | null> {
    if (this.decryptedKey !== undefined) return this.decryptedKey;
    const record = await this.records.getApiKeyRecord();
    const { encryptionPassphrase } = this.options;
    this.decryptedKey =
      record && encryptionPassphrase !== undefined
        ? unseal(record, encryptionPassphrase)
        : null;
    return this.decryptedKey;
  }
}
