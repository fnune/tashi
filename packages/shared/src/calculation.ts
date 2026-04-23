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

const FAT_KCAL_PER_G = 9;
const PROTEIN_KCAL_PER_G = 4;
const CARB_KCAL_PER_G = 4;

export function evaluateFatProteinThreshold(items: CalculatedItem[]): {
  met: boolean;
  reason: string;
  total_fat_g: number;
  total_protein_g: number;
} {
  const total_fat_g = items.reduce((sum, item) => sum + item.fat_g, 0);
  const total_protein_g = items.reduce((sum, item) => sum + item.protein_g, 0);

  if (total_fat_g > 30) {
    return { met: true, reason: "high_fat", total_fat_g, total_protein_g };
  }

  if (total_fat_g > 15 && total_protein_g > 25) {
    return {
      met: true,
      reason: "fat_and_protein",
      total_fat_g,
      total_protein_g,
    };
  }

  const totalCarbs = items.reduce((sum, item) => sum + item.net_carbs_g, 0);
  const fatProteinEnergy =
    total_fat_g * FAT_KCAL_PER_G + total_protein_g * PROTEIN_KCAL_PER_G;
  const totalEnergy = fatProteinEnergy + totalCarbs * CARB_KCAL_PER_G;

  if (totalEnergy > 0 && fatProteinEnergy / totalEnergy > 0.8) {
    return { met: true, reason: "energy_ratio", total_fat_g, total_protein_g };
  }

  return { met: false, reason: "", total_fat_g, total_protein_g };
}

interface CorrectionResult {
  current_blood_sugar: number;
  target_blood_sugar: number;
  correction_factor: number;
  correction_dose: number;
  total_dose: number;
}

interface FatProteinAdjustmentResult {
  total_fat_g: number;
  total_protein_g: number;
  threshold_met: string;
  multiplier: number;
  adjustment_dose: number;
  total_dose: number;
}

export function calculateCorrectionDose(
  foodDose: number,
  currentBloodSugar: number,
  settings: Settings,
): CorrectionResult | undefined {
  if (settings.correction_factor === null) return undefined;
  const correctionDose =
    (currentBloodSugar - settings.target_blood_sugar) /
    settings.correction_factor;
  const roundedCorrection = roundToIncrement(
    correctionDose,
    settings.pen_increment,
  );
  return {
    current_blood_sugar: currentBloodSugar,
    target_blood_sugar: settings.target_blood_sugar,
    correction_factor: settings.correction_factor,
    correction_dose: roundedCorrection,
    total_dose: Math.max(
      0,
      roundToIncrement(foodDose + roundedCorrection, settings.pen_increment),
    ),
  };
}

export function calculateFatProteinAdjustment(
  items: CalculatedItem[],
  foodDose: number,
  correctionDose: number,
  settings: Settings,
): FatProteinAdjustmentResult | undefined {
  if (settings.fat_protein_multiplier <= 0) return undefined;
  const threshold = evaluateFatProteinThreshold(items);
  if (!threshold.met) return undefined;

  const adjustmentDose = roundToIncrement(
    foodDose * settings.fat_protein_multiplier,
    settings.pen_increment,
  );
  return {
    total_fat_g: threshold.total_fat_g,
    total_protein_g: threshold.total_protein_g,
    threshold_met: threshold.reason,
    multiplier: settings.fat_protein_multiplier,
    adjustment_dose: adjustmentDose,
    total_dose: Math.max(
      0,
      roundToIncrement(
        foodDose + correctionDose + adjustmentDose,
        settings.pen_increment,
      ),
    ),
  };
}

export function calculateDose(
  items: CalculatedItem[],
  ratio: number,
  settings: Settings,
  currentBloodSugar?: number,
): {
  totalNetCarbs: number;
  foodDose: number;
  correction?: CorrectionResult;
  fat_protein_adjustment?: FatProteinAdjustmentResult;
} {
  const totalNetCarbs = items.reduce((sum, item) => sum + item.net_carbs_g, 0);
  const rawDose = totalNetCarbs / ratio;
  const foodDose = roundToIncrement(rawDose, settings.pen_increment);

  const correction =
    currentBloodSugar !== undefined
      ? calculateCorrectionDose(foodDose, currentBloodSugar, settings)
      : undefined;

  const fat_protein_adjustment = calculateFatProteinAdjustment(
    items,
    foodDose,
    correction?.correction_dose ?? 0,
    settings,
  );

  const result: ReturnType<typeof calculateDose> = {
    totalNetCarbs,
    foodDose,
  };
  if (correction) result.correction = correction;
  if (fat_protein_adjustment)
    result.fat_protein_adjustment = fat_protein_adjustment;
  return result;
}
