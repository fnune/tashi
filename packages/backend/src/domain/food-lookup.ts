import type { FoodItem } from "@tashi/shared";

export interface FoodLookup {
  getByFdcId(fdcId: number): FoodItem | null;
}
