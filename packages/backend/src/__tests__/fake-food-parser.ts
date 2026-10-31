import type { FoodVocabEntry, ParsedFoodItem } from "@tashi/shared";
import type { FoodParser, ParseOutcome } from "../domain/food-parser.js";

type FakeOutcome =
  | { status: "ok"; items: ParsedFoodItem[] }
  | { status: "needs_clarification"; message: string }
  | { status: "rejected"; message: string };

export class FakeFoodParser implements FoodParser {
  private responses: Map<string, FakeOutcome> = new Map();

  constructor(private model = "fake") {}

  setResponse(description: string, items: ParsedFoodItem[]): void {
    this.responses.set(description, { status: "ok", items });
  }

  setClarification(description: string, message: string): void {
    this.responses.set(description, {
      status: "needs_clarification",
      message,
    });
  }

  setRejection(description: string, message: string): void {
    this.responses.set(description, { status: "rejected", message });
  }

  async parse(
    foodDescription: string,
    _vocabulary: FoodVocabEntry[] = [],
    _language: "en" | "es" = "en",
  ): Promise<ParseOutcome> {
    const response = this.responses.get(foodDescription);
    if (!response) {
      throw new Error(
        `FakeFoodParser: no response configured for "${foodDescription}"`,
      );
    }

    const trace = {
      searches: [],
      raw_response: JSON.stringify(response),
      model: this.model,
      duration_ms: 0,
    };

    const usage = {
      model: this.model,
      inputTokens: 1000,
      outputTokens: 200,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };

    if (response.status === "ok") {
      return { status: "ok", items: response.items, trace, usage };
    }
    return {
      status: response.status,
      message: response.message,
      trace,
      usage,
    };
  }
}
