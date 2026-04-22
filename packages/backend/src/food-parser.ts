import type { ParsedFoodItem } from "@pincho/shared";

export interface FoodParser {
  parse(foodDescription: string): Promise<ParsedFoodItem[]>;
}
