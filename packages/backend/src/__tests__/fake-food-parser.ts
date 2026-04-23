import type { ParsedFoodItem } from "@pincho/shared";
import type { FoodParser, ParseResult } from "../food-parser.js";

export class FakeFoodParser implements FoodParser {
  private responses: Map<string, ParsedFoodItem[]> = new Map();

  setResponse(description: string, items: ParsedFoodItem[]): void {
    this.responses.set(description, items);
  }

  async parse(foodDescription: string): Promise<ParseResult> {
    const response = this.responses.get(foodDescription);
    if (!response) {
      throw new Error(
        `FakeFoodParser: no response configured for "${foodDescription}"`,
      );
    }

    return {
      items: response,
      trace: {
        searches: [],
        raw_response: JSON.stringify(response),
        model: "fake",
        duration_ms: 0,
      },
    };
  }
}
