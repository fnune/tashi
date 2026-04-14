import type { ParsedFoodItem } from "@t1d-aid/shared";
import type { FoodParser } from "../food-parser.js";

export class FakeFoodParser implements FoodParser {
  private responses: Map<string, ParsedFoodItem[]> = new Map();

  setResponse(description: string, items: ParsedFoodItem[]): void {
    this.responses.set(description, items);
  }

  async parse(
    foodDescription: string,
    _foodIndex: string,
  ): Promise<ParsedFoodItem[]> {
    const response = this.responses.get(foodDescription);
    if (response) return response;

    throw new Error(
      `FakeFoodParser: no response configured for "${foodDescription}"`,
    );
  }
}
