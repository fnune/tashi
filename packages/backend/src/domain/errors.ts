import type { ApiErrorCode } from "@tashi/shared";

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
