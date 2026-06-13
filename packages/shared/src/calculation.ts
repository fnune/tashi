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

function roundDisplay(value: number): number {
  return Math.round(value * 10) / 10;
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
  iob: number;
  iob_reduction: number;
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

export function calculateDose(
  items: CalculatedItem[],
  ratio: number,
  settings: Settings,
  currentBloodSugar?: number,
  iob = 0,
): {
  totalNetCarbs: number;
  foodDose: number;
  correction?: CorrectionResult;
  fat_protein_adjustment?: FatProteinAdjustmentResult;
} {
  const totalNetCarbs = items.reduce((sum, item) => sum + item.net_carbs_g, 0);
  const rawFoodDose = totalNetCarbs / ratio;
  const foodDose = roundToIncrement(rawFoodDose, settings.pen_increment);

  let rawCorrectionDose = 0;
  let correction: CorrectionResult | undefined;
  if (currentBloodSugar !== undefined && settings.correction_factor !== null) {
    const bgCorrection =
      (currentBloodSugar - settings.target_blood_sugar) /
      settings.correction_factor;
    // IOB only cancels a positive (high-BG) correction; it never reduces the
    // meal dose. A low-BG (negative) correction is left untouched.
    const iobReduction = bgCorrection > 0 ? Math.min(iob, bgCorrection) : 0;
    rawCorrectionDose = bgCorrection - iobReduction;
    correction = {
      current_blood_sugar: currentBloodSugar,
      target_blood_sugar: settings.target_blood_sugar,
      correction_factor: settings.correction_factor,
      correction_dose: roundDisplay(rawCorrectionDose),
      iob: roundDisplay(iob),
      iob_reduction: roundDisplay(iobReduction),
      total_dose: Math.max(
        0,
        roundToIncrement(
          rawFoodDose + rawCorrectionDose,
          settings.pen_increment,
        ),
      ),
    };
  }

  let fat_protein_adjustment: FatProteinAdjustmentResult | undefined;
  if (settings.fat_protein_multiplier > 0) {
    const threshold = evaluateFatProteinThreshold(items);
    if (threshold.met) {
      const rawAdjustmentDose = rawFoodDose * settings.fat_protein_multiplier;
      fat_protein_adjustment = {
        total_fat_g: threshold.total_fat_g,
        total_protein_g: threshold.total_protein_g,
        threshold_met: threshold.reason,
        multiplier: settings.fat_protein_multiplier,
        adjustment_dose: roundDisplay(rawAdjustmentDose),
        total_dose: Math.max(
          0,
          roundToIncrement(
            rawFoodDose + rawCorrectionDose + rawAdjustmentDose,
            settings.pen_increment,
          ),
        ),
      };
    }
  }

  const result: ReturnType<typeof calculateDose> = {
    totalNetCarbs,
    foodDose,
  };
  if (correction) result.correction = correction;
  if (fat_protein_adjustment)
    result.fat_protein_adjustment = fat_protein_adjustment;
  return result;
}
