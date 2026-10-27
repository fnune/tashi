import type { FoodItem, FoodVocabEntry, ParsedFoodItem } from "@tashi/shared";
import {
  activeProfile,
  appliedProfile,
  type CalculatedItem,
  type CalculationResult,
  calculateDose,
  doseScale,
  effectiveRatio,
  findMealWindow,
  type Settings,
} from "@tashi/shared";
import type { Clock } from "./clock.js";
import type { FoodDatabase, FoodMatch } from "./db/food-db.js";
import type { FoodParser } from "./food-parser.js";
import type { IdGenerator } from "./ids.js";

export type CalculateOutcome =
  | { status: "ok"; result: CalculationResult }
  | { status: "needs_clarification"; message: string }
  | { status: "rejected"; message: string };

function matchToFoodItem(match: FoodMatch): FoodItem {
  return {
    fdc_id: match.fdc_id,
    description: match.description,
    data_type: match.data_type,
    category: match.category,
    net_carbs_per_100g: match.net_carbs_per_100g,
    total_carbs_per_100g: match.total_carbs_per_100g,
    fiber_per_100g: match.fiber_per_100g,
    sugars_per_100g: match.sugars_per_100g,
    fat_per_100g: match.fat_per_100g,
    protein_per_100g: match.protein_per_100g,
    serving_g: match.serving_g,
    serving_desc: match.serving_desc,
    name_es: match.name_es,
    glycemic_index: match.glycemic_index,
    gi_source: match.gi_source,
    cooking_multiplier: match.cooking_multiplier,
  };
}

export class Calculator {
  private parser: FoodParser;
  private foodDb: FoodDatabase;
  private clock: Clock;
  private newId: IdGenerator;

  constructor(
    parser: FoodParser,
    foodDb: FoodDatabase,
    clock: Clock,
    newId: IdGenerator,
  ) {
    this.parser = parser;
    this.foodDb = foodDb;
    this.clock = clock;
    this.newId = newId;
  }

  async calculate(
    foodDescription: string,
    settings: Settings,
    currentBloodSugar?: number,
    mealWindowOverride?: string,
    vocabulary: FoodVocabEntry[] = [],
    iob = 0,
    timeZone?: string,
  ): Promise<CalculateOutcome> {
    const outcome = await this.parser.parse(
      foodDescription,
      vocabulary,
      settings.language,
    );
    if (outcome.status !== "ok") {
      return { status: outcome.status, message: outcome.message };
    }
    const { items: parsedItems, trace } = outcome;
    const items = this.resolveItems(parsedItems);

    const mealWindow = mealWindowOverride
      ? settings.meal_windows.find((w) => w.name === mealWindowOverride)
      : findMealWindow(settings, this.clock(), timeZone);

    if (!mealWindow) {
      throw new Error("No meal window matches the current time");
    }

    const profile = activeProfile(settings);
    const ratio = effectiveRatio(profile, mealWindow);
    const dose = calculateDose(
      items,
      ratio,
      settings,
      currentBloodSugar,
      iob,
      doseScale(profile),
    );

    const inputLang = this.detectLanguage(foodDescription);

    return {
      status: "ok",
      result: {
        id: this.newId(),
        timestamp: this.clock().toISOString(),
        input_text: foodDescription,
        language: inputLang,
        meal_window: { ...mealWindow, ratio },
        items,
        total_net_carbs_g: Math.round(dose.totalNetCarbs * 10) / 10,
        recommended_dose: dose.foodDose,
        total_dose: dose.totalDose,
        profile: appliedProfile(profile),
        correction: dose.correction,
        fat_protein_adjustment: dose.fat_protein_adjustment,
        trace,
      },
    };
  }

  private resolveUserCarbsPer100g(parsed: ParsedFoodItem): number | null {
    if (!parsed.user_carbs) return null;
    if (parsed.user_carbs.basis === "per_100g")
      return parsed.user_carbs.net_carbs;
    return parsed.weight_g > 0
      ? (parsed.user_carbs.net_carbs / parsed.weight_g) * 100
      : null;
  }

  private resolveItems(parsedItems: ParsedFoodItem[]): CalculatedItem[] {
    return parsedItems.map((parsed) => {
      const match =
        parsed.fdc_id !== null ? this.foodDb.getByFdcId(parsed.fdc_id) : null;

      let netCarbsPer100g: number;
      let estimated = false;
      let dataSource: string;
      let foodItem: FoodItem | null = null;
      let warning = parsed.warning;

      const userPer100g = this.resolveUserCarbsPer100g(parsed);

      if (userPer100g !== null) {
        netCarbsPer100g = userPer100g;
        dataSource = match ? match.data_type : "user";
        if (match) {
          foodItem = matchToFoodItem(match);
          const diff = Math.abs(userPer100g - match.net_carbs_per_100g);
          if (diff > 5 || diff / Math.max(match.net_carbs_per_100g, 1) > 0.3) {
            const usdaWarning = `USDA: ${match.net_carbs_per_100g}g HC netos/100g vs usuario: ${userPer100g}g`;
            warning = warning ? `${warning}. ${usdaWarning}` : usdaWarning;
          }
        }
      } else if (match) {
        foodItem = matchToFoodItem(match);
        netCarbsPer100g = match.net_carbs_per_100g;
        dataSource = match.data_type;
      } else if (
        parsed.estimated_net_carbs_per_100g !== null &&
        parsed.estimated_net_carbs_per_100g !== undefined
      ) {
        netCarbsPer100g = parsed.estimated_net_carbs_per_100g;
        estimated = true;
        dataSource = "LLM estimate";
      } else {
        netCarbsPer100g = 0;
        dataSource = "unknown";
      }

      const netCarbsG = (netCarbsPer100g / 100) * parsed.weight_g;
      const dbGi = foodItem?.glycemic_index ?? null;
      const gi = dbGi ?? parsed.estimated_glycemic_index ?? null;

      const fatPer100g =
        foodItem?.fat_per_100g ?? parsed.estimated_fat_per_100g ?? 0;
      const proteinPer100g =
        foodItem?.protein_per_100g ?? parsed.estimated_protein_per_100g ?? 0;
      const fatG = (fatPer100g / 100) * parsed.weight_g;
      const proteinG = (proteinPer100g / 100) * parsed.weight_g;

      return {
        description: parsed.description,
        weight_g: parsed.weight_g,
        net_carbs_per_100g: Math.round(netCarbsPer100g * 10) / 10,
        net_carbs_g: Math.round(netCarbsG * 10) / 10,
        fat_per_100g: Math.round(fatPer100g * 100) / 100,
        protein_per_100g: Math.round(proteinPer100g * 100) / 100,
        fat_g: Math.round(fatG * 10) / 10,
        protein_g: Math.round(proteinG * 10) / 10,
        assumed_cooked: parsed.assumed_cooked,
        confidence: parsed.confidence,
        notes: parsed.notes,
        warning,
        data_source: dataSource,
        estimated,
        glycemic_index: gi,
        gi_estimated: dbGi === null && gi !== null,
        food_item: foodItem,
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
