import Anthropic from "@anthropic-ai/sdk";
import type { FoodVocabEntry } from "@tashi/shared";
import type { ApiKeyStore } from "./api-key-store.js";
import {
  DomainError,
  InvalidApiKeyError,
  MissingApiKeyError,
} from "./errors.js";
import type { FoodParser, ParseOutcome } from "./food-parser.js";

export class KeyedFoodParser implements FoodParser {
  private inner: { apiKey: string; parser: FoodParser } | null = null;

  constructor(
    private keys: ApiKeyStore,
    private create: (apiKey: string) => FoodParser,
  ) {}

  async parse(
    foodDescription: string,
    vocabulary: FoodVocabEntry[],
    language: "en" | "es",
  ): Promise<ParseOutcome> {
    const apiKey = await this.keys.get();
    if (!apiKey) throw new MissingApiKeyError();
    if (this.inner?.apiKey !== apiKey) {
      this.inner = { apiKey, parser: this.create(apiKey) };
    }
    try {
      return await this.inner.parser.parse(
        foodDescription,
        vocabulary,
        language,
      );
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        throw new InvalidApiKeyError();
      }
      if (creditRanOut(e)) throw new DomainError("credit_exhausted");
      throw e;
    }
  }
}

function creditRanOut(error: unknown): boolean {
  return (
    error instanceof Anthropic.APIError &&
    (error.status === 402 ||
      (error.status === 400 && /credit balance/i.test(error.message)))
  );
}

export async function anthropicAcceptsKey(apiKey: string): Promise<boolean> {
  try {
    await new Anthropic({ apiKey }).models.list({ limit: 1 });
    return true;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return false;
    throw e;
  }
}
