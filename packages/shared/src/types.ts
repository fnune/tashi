export interface FoodItem {
  id: string;
  name_en: string;
  name_es: string;
  total_carbs_per_100g: number;
  fibre_per_100g: number;
  net_carbs_per_100g: number;
  carbs_include_fibre: boolean;
  sugars_per_100g: number;
  glycemic_index: number | null;
  gi_source: string | null;
  typical_serving_g: number;
  cooking_multiplier: number | null;
  data_source: string;
  data_source_id: string;
}

export interface ParsedFoodItem {
  description: string;
  weight_g: number;
  db_key: string | null;
  assumed_cooked: boolean;
  confidence: "high" | "medium" | "low";
  notes: string | null;
  estimated_net_carbs_per_100g: number | null;
  warning: string | null;
}

export interface CalculatedItem {
  description: string;
  weight_g: number;
  net_carbs_g: number;
  assumed_cooked: boolean;
  confidence: "high" | "medium" | "low";
  notes: string | null;
  warning: string | null;
  data_source: string;
  estimated: boolean;
  food_item: FoodItem | null;
}

export interface MealWindow {
  name: string;
  start_hour: number;
  end_hour: number;
  ratio: number;
}

export interface Settings {
  meal_windows: MealWindow[];
  correction_factor: number | null;
  target_blood_sugar: number;
  pen_increment: 0.5 | 1;
  language: "en" | "es";
}

export interface CalculationResult {
  id: string;
  timestamp: string;
  input_text: string;
  language: "en" | "es";
  meal_window: MealWindow;
  items: CalculatedItem[];
  total_net_carbs_g: number;
  recommended_dose: number;
  correction?: {
    current_blood_sugar: number;
    target_blood_sugar: number;
    correction_factor: number;
    correction_dose: number;
    total_dose: number;
  };
}

export interface CalculateRequest {
  food_description: string;
  current_blood_sugar?: number;
  meal_window_override?: string;
}

export interface CalculateResponse {
  result: CalculationResult;
}

export interface ErrorResponse {
  error: string;
}

export const DEFAULT_SETTINGS: Settings = {
  meal_windows: [
    { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
    { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    { name: "dinner", start_hour: 16, end_hour: 23, ratio: 12 },
  ],
  correction_factor: null,
  target_blood_sugar: 6.0,
  pen_increment: 0.5,
  language: "en",
};
