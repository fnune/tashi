import type { ApiErrorCode } from "@tashi/shared";
import type { ModelUsage } from "./model-usage.js";

export class DomainError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class MissingApiKeyError extends DomainError {
  constructor() {
    super("api_key_missing", "No API key configured");
  }
}

export class InvalidApiKeyError extends DomainError {
  constructor() {
    super("api_key_invalid", "The API key was rejected");
  }
}

export type CalculationFailure =
  | "calculation_unfinished"
  | "ai_busy"
  | "ai_unreachable"
  | "ai_declined";

export class CalculationFailedError extends DomainError {
  constructor(
    readonly code: CalculationFailure,
    message: string,
    readonly lookedUp: string[],
    readonly usage: ModelUsage | null,
    options?: { cause?: unknown },
  ) {
    super(code, message);
    this.name = "CalculationFailedError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}
