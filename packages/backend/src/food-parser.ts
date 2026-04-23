import type { ParsedFoodItem, ParseTrace } from "@pincho/shared";

export interface ParseResult {
  items: ParsedFoodItem[];
  trace: ParseTrace;
}

export interface FoodParser {
  parse(foodDescription: string): Promise<ParseResult>;
}
