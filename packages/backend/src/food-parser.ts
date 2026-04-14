import type { ParsedFoodItem } from "@t1d-aid/shared";

export interface FoodParser {
  parse(foodDescription: string, foodIndex: string): Promise<ParsedFoodItem[]>;
}
