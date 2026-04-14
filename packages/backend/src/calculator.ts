import type { ParsedFoodItem } from "@pincho/shared";
import {
  type CalculatedItem,
  type CalculationResult,
  calculateDose,
  findMealWindow,
  type Settings,
} from "@pincho/shared";
import { buildFoodIndex, getFoodById } from "./db/foods.js";
import type { FoodParser } from "./food-parser.js";

export class Calculator {
  private parser: FoodParser;
  private foodIndex: string;

  constructor(parser: FoodParser) {
    this.parser = parser;
    this.foodIndex = buildFoodIndex();
  }

  async calculate(
    foodDescription: string,
    settings: Settings,
    currentBloodSugar?: number,
    mealWindowOverride?: string,
  ): Promise<CalculationResult> {
    const parsedItems = await this.parser.parse(
      foodDescription,
      this.foodIndex,
    );
    const items = this.resolveItems(parsedItems);

    const mealWindow = mealWindowOverride
      ? settings.meal_windows.find((w) => w.name === mealWindowOverride)
      : findMealWindow(settings);

    if (!mealWindow) {
      throw new Error("No meal window matches the current time");
    }

    const dose = calculateDose(
      items,
      mealWindow.ratio,
      settings,
      currentBloodSugar,
    );

    const inputLang = this.detectLanguage(foodDescription);

    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      input_text: foodDescription,
      language: inputLang,
      meal_window: mealWindow,
      items,
      total_net_carbs_g: Math.round(dose.totalNetCarbs * 10) / 10,
      recommended_dose: dose.foodDose,
      correction: dose.correction,
    };
  }

  private resolveItems(parsedItems: ParsedFoodItem[]): CalculatedItem[] {
    return parsedItems.map((parsed) => {
      const foodItem = parsed.db_key ? getFoodById(parsed.db_key) : undefined;

      let netCarbsG: number;
      let estimated = false;
      let dataSource: string;

      if (foodItem) {
        netCarbsG = (foodItem.net_carbs_per_100g / 100) * parsed.weight_g;
        dataSource = foodItem.data_source;
      } else if (
        parsed.estimated_net_carbs_per_100g !== null &&
        parsed.estimated_net_carbs_per_100g !== undefined
      ) {
        netCarbsG =
          (parsed.estimated_net_carbs_per_100g / 100) * parsed.weight_g;
        estimated = true;
        dataSource = "LLM estimate";
      } else {
        netCarbsG = 0;
        dataSource = "unknown";
      }

      const dbGi = foodItem?.glycemic_index ?? null;
      const gi = dbGi ?? parsed.estimated_glycemic_index ?? null;

      return {
        description: parsed.description,
        weight_g: parsed.weight_g,
        net_carbs_g: Math.round(netCarbsG * 10) / 10,
        assumed_cooked: parsed.assumed_cooked,
        confidence: parsed.confidence,
        notes: parsed.notes,
        warning: parsed.warning,
        data_source: dataSource,
        estimated,
        glycemic_index: gi,
        gi_estimated: dbGi === null && gi !== null,
        food_item: foodItem ?? null,
      };
    });
  }

  private detectLanguage(text: string): "en" | "es" {
    const spanishMarkers = [
      "arroz",
      "pollo",
      "ensalada",
      "pan",
      "patata",
      "leche",
      "cocido",
      "cocida",
      "frito",
      "frita",
      "plancha",
      "hervido",
      "gramos",
      "con",
      "del",
      "una",
      "aceite",
    ];
    const lower = text.toLowerCase();
    const spanishHits = spanishMarkers.filter((m) => lower.includes(m)).length;
    return spanishHits >= 2 ? "es" : "en";
  }
}
