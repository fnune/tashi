import Anthropic from "@anthropic-ai/sdk";
import type { CalculationStep, FoodVocabEntry } from "@tashi/shared";
import type { AiConnection } from "./ai-connections.js";
import {
  DomainError,
  InvalidApiKeyError,
  MissingApiKeyError,
} from "./errors.js";
import type { FoodParser, ParseOutcome } from "./food-parser.js";

export class KeyedFoodParser implements FoodParser {
  constructor(private inner: FoodParser) {}

  async parse(
    foodDescription: string,
    vocabulary: FoodVocabEntry[],
    language: "en" | "es",
    connection: AiConnection | null,
    onStep?: (step: CalculationStep) => void,
  ): Promise<ParseOutcome> {
    if (!connection) throw new MissingApiKeyError();
    try {
      return await this.inner.parse(
        foodDescription,
        vocabulary,
        language,
        connection,
        onStep,
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
