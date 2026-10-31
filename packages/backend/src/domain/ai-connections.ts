import type { AiConnectionStatus } from "@tashi/shared";
import { sealText, unsealText } from "./auth/data-key.js";
import type { Clock } from "./clock.js";
import { DomainError, InvalidApiKeyError } from "./errors.js";
import type { IdGenerator } from "./ids.js";
import { DEFAULT_MODEL, MODELS } from "./models.js";
import type {
  AiConnectionKind,
  AiConnectionRepository,
} from "./repositories.js";

export interface AiConnection {
  kind: AiConnectionKind;
  model: string;
  apiKey: string;
}

export interface AiConnectionsOptions {
  kind: AiConnectionKind;
  clock: Clock;
  newId: IdGenerator;
  verify?: (apiKey: string) => Promise<boolean>;
}

export class AiConnections {
  constructor(
    private records: AiConnectionRepository,
    private options: AiConnectionsOptions,
  ) {}

  async get(dataKey: Uint8Array<ArrayBuffer>): Promise<AiConnection | null> {
    const stored = await this.records.get(this.options.kind);
    const apiKey = stored && (await unsealText(stored.sealedApiKey, dataKey));
    return stored && apiKey
      ? { kind: stored.kind, model: stored.model, apiKey }
      : null;
  }

  async status(dataKey: Uint8Array<ArrayBuffer>): Promise<AiConnectionStatus> {
    const connection = await this.get(dataKey);
    return {
      connected: connection !== null,
      model: connection?.model ?? DEFAULT_MODEL,
      models: this.models().map(({ id, label }) => ({ id, label })),
    };
  }

  async connect(
    dataKey: Uint8Array<ArrayBuffer>,
    apiKey: string,
    model = DEFAULT_MODEL,
  ): Promise<void> {
    const { kind, clock, newId, verify } = this.options;
    this.mustOffer(model);
    if (verify && !(await verify(apiKey))) throw new InvalidApiKeyError();
    await this.records.replace(
      {
        id: newId(),
        kind,
        model,
        sealedApiKey: await sealText(apiKey, dataKey),
      },
      clock(),
    );
  }

  async chooseModel(model: string): Promise<void> {
    this.mustOffer(model);
    if (!(await this.records.setModel(this.options.kind, model))) {
      throw new DomainError("not_found");
    }
  }

  async disconnect(): Promise<void> {
    await this.records.delete(this.options.kind);
  }

  private models() {
    return MODELS.filter((model) => model.kind === this.options.kind);
  }

  private mustOffer(model: string): void {
    if (!this.models().some((offered) => offered.id === model)) {
      throw new DomainError("validation_failed", `Unknown model ${model}`);
    }
  }
}
