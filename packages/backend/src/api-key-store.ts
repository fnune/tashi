import type { ApiKeyStatus } from "@tashi/shared";
import { InvalidApiKeyError, SecretUnavailableError } from "./errors.js";
import { type SealedSecret, seal, unseal } from "./secret-box.js";

export interface ApiKeyRecords {
  getApiKeyRecord(): Promise<SealedSecret | null>;
  saveApiKeyRecord(record: SealedSecret): Promise<void>;
  deleteApiKeyRecord(): Promise<void>;
}

export interface ApiKeyStoreOptions {
  /** Encrypts the saved key. Without it the key can only come from the environment. */
  passphrase?: string;
  environmentKey?: string;
  verify?: (apiKey: string) => Promise<boolean>;
}

export class ApiKeyStore {
  // Decrypting derives a key with scrypt, which is too slow to repeat per request.
  private cached: string | null | undefined;

  constructor(
    private records: ApiKeyRecords,
    private options: ApiKeyStoreOptions = {},
  ) {}

  async get(): Promise<string | null> {
    return (await this.stored()) ?? this.options.environmentKey ?? null;
  }

  async status(): Promise<ApiKeyStatus> {
    const can_save = this.options.passphrase !== undefined;
    if ((await this.stored()) !== null) {
      return { configured: true, source: "settings", can_save };
    }
    if (this.options.environmentKey) {
      return { configured: true, source: "environment", can_save };
    }
    return { configured: false, source: null, can_save };
  }

  async save(apiKey: string): Promise<void> {
    const { passphrase, verify } = this.options;
    if (passphrase === undefined) throw new SecretUnavailableError();
    if (verify && !(await verify(apiKey))) throw new InvalidApiKeyError();
    await this.records.saveApiKeyRecord(seal(apiKey, passphrase));
    this.cached = apiKey;
  }

  async clear(): Promise<void> {
    await this.records.deleteApiKeyRecord();
    this.cached = null;
  }

  private async stored(): Promise<string | null> {
    if (this.cached !== undefined) return this.cached;
    const record = await this.records.getApiKeyRecord();
    const { passphrase } = this.options;
    this.cached =
      record && passphrase !== undefined ? unseal(record, passphrase) : null;
    return this.cached;
  }
}
