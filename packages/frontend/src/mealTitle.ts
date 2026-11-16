import type { MealEntry } from "@tashi/shared";

export function mealTitle(
  meal: Pick<MealEntry, "input_text" | "items" | "meal_window">,
): string {
  const text = meal.input_text.replace(/\s+/g, " ").trim();
  if (text) return text;
  const foods = meal.items.map((item) => item.description).join(", ");
  return foods || meal.meal_window.name;
}
