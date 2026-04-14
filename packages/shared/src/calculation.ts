import type { CalculatedItem, MealWindow, Settings } from "./types.js";

export function findMealWindow(
  settings: Settings,
  date: Date = new Date(),
): MealWindow | null {
  const hour = date.getHours();
  return (
    settings.meal_windows.find(
      (w) => hour >= w.start_hour && hour < w.end_hour,
    ) ?? null
  );
}

export function roundToIncrement(value: number, increment: 0.5 | 1): number {
  return Math.round(value / increment) * increment;
}

export function calculateDose(
  items: CalculatedItem[],
  ratio: number,
  settings: Settings,
  currentBloodSugar?: number,
): {
  totalNetCarbs: number;
  foodDose: number;
  correction?: {
    current_blood_sugar: number;
    target_blood_sugar: number;
    correction_factor: number;
    correction_dose: number;
    total_dose: number;
  };
} {
  const totalNetCarbs = items.reduce((sum, item) => sum + item.net_carbs_g, 0);
  const rawDose = totalNetCarbs / ratio;
  const foodDose = roundToIncrement(rawDose, settings.pen_increment);

  if (
    currentBloodSugar !== undefined &&
    settings.correction_factor !== null
  ) {
    const correctionDose =
      (currentBloodSugar - settings.target_blood_sugar) /
      settings.correction_factor;
    const roundedCorrection = roundToIncrement(
      correctionDose,
      settings.pen_increment,
    );
    const totalDose = Math.max(
      0,
      roundToIncrement(foodDose + roundedCorrection, settings.pen_increment),
    );
    return {
      totalNetCarbs,
      foodDose,
      correction: {
        current_blood_sugar: currentBloodSugar,
        target_blood_sugar: settings.target_blood_sugar,
        correction_factor: settings.correction_factor,
        correction_dose: roundedCorrection,
        total_dose: totalDose,
      },
    };
  }

  return { totalNetCarbs, foodDose };
}
