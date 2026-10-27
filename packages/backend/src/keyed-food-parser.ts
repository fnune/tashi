import Anthropic from "@anthropic-ai/sdk";
import type { FoodVocabEntry } from "@tashi/shared";
import type { ApiKeyStore } from "./api-key-store.js";
import { InvalidApiKeyError, MissingApiKeyError } from "./errors.js";
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
      throw e;
    }
  }
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
