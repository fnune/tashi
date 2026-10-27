export class MissingApiKeyError extends Error {
  constructor() {
    super("No API key configured");
  }
}

export class InvalidApiKeyError extends Error {
  constructor() {
    super("The API key was rejected");
  }
}

export class SecretUnavailableError extends Error {
  constructor() {
    super("No passphrase to encrypt the API key with");
  }
}
