import type {
  CalculatedItem,
  CalculationResult,
  MealWindow,
  Settings,
} from "./types.js";

export function localHour(date: Date, timeZone?: string): number {
  if (!timeZone) return date.getHours();
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    });
    const hour = Number(formatter.format(date));
    return Number.isInteger(hour) ? hour % 24 : date.getHours();
  } catch {
    return date.getHours();
  }
}

export function findMealWindow(
  settings: Settings,
  date: Date = new Date(),
  timeZone?: string,
): MealWindow | null {
  const hour = localHour(date, timeZone);
  return settings.meal_windows.find((w) => windowCovers(w, hour)) ?? null;
}

export function windowCovers(window: MealWindow, hour: number): boolean {
  const { start_hour: start, end_hour: end } = window;
  const spansWholeDay = start % 24 === end % 24;
  const crossesMidnight = start > end;
  if (spansWholeDay) return true;
  if (crossesMidnight) return hour >= start || hour < end;
  return hour >= start && hour < end;
}

export interface HourRange {
  start_hour: number;
  end_hour: number;
}

export function uncoveredHours(windows: MealWindow[]): HourRange[] {
  const covered = Array.from({ length: 24 }, (_, hour) =>
    windows.some((w) => windowCovers(w, hour)),
  );
  if (covered.every(Boolean)) return [];
  const firstCovered = covered.indexOf(true);
  if (firstCovered === -1) return [{ start_hour: 0, end_hour: 24 }];

  const gaps: HourRange[] = [];
  let gapStart: number | null = null;
  for (let i = 1; i <= 24; i++) {
    const hour = (firstCovered + i) % 24;
    if (!covered[hour] && gapStart === null) gapStart = hour;
    if (covered[hour] && gapStart !== null) {
      gaps.push({ start_hour: gapStart, end_hour: hour });
      gapStart = null;
    }
  }
  return gaps;
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

export function correctionComponents(
  currentBloodSugar: number,
  settings: Settings,
  iob: number,
): { correctionFactor: number; iobReduction: number; units: number } | null {
  const correctionFactor = settings.correction_factor;
  if (correctionFactor === null) return null;
  const bgCorrection =
    (currentBloodSugar - settings.target_blood_sugar) / correctionFactor;
  // IOB only cancels a positive (high-BG) correction; it never reduces the
  // meal dose. A low-BG (negative) correction is left untouched.
  const iobReduction = bgCorrection > 0 ? Math.min(iob, bgCorrection) : 0;
  return { correctionFactor, iobReduction, units: bgCorrection - iobReduction };
}

export function calculateDose(
  items: CalculatedItem[],
  ratio: number,
  settings: Settings,
  currentBloodSugar?: number,
  iob = 0,
  doseScale = 1,
): {
  totalNetCarbs: number;
  foodDose: number;
  totalDose: number;
  correction?: CorrectionResult;
  fat_protein_adjustment?: FatProteinAdjustmentResult;
} {
  const totalNetCarbs = items.reduce((sum, item) => sum + item.net_carbs_g, 0);
  const rawFoodDose = totalNetCarbs / ratio;
  const foodDose = roundToIncrement(rawFoodDose, settings.pen_increment);

  let rawCorrectionDose = 0;
  let correction: CorrectionResult | undefined;
  const components =
    currentBloodSugar === undefined
      ? null
      : correctionComponents(currentBloodSugar, settings, iob);
  if (currentBloodSugar !== undefined && components !== null) {
    const { iobReduction } = components;
    rawCorrectionDose = components.units;
    correction = {
      current_blood_sugar: currentBloodSugar,
      target_blood_sugar: settings.target_blood_sugar,
      correction_factor: components.correctionFactor,
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
  let rawAdjustmentDose = 0;
  if (settings.fat_protein_multiplier > 0) {
    const threshold = evaluateFatProteinThreshold(items);
    if (threshold.met) {
      rawAdjustmentDose = rawFoodDose * settings.fat_protein_multiplier;
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

  const rawTotal =
    rawFoodDose +
    rawCorrectionDose +
    (fat_protein_adjustment
      ? rawFoodDose * settings.fat_protein_multiplier
      : 0);
  const result: ReturnType<typeof calculateDose> = {
    totalNetCarbs,
    foodDose,
    totalDose: Math.max(
      0,
      roundToIncrement(rawTotal * doseScale, settings.pen_increment),
    ),
  };
  if (correction) result.correction = correction;
  if (fat_protein_adjustment)
    result.fat_protein_adjustment = fat_protein_adjustment;
  return result;
}

export function withWeight(
  item: CalculatedItem,
  weight_g: number,
): CalculatedItem {
  const per100 = weight_g / 100;
  return {
    ...item,
    weight_g,
    net_carbs_g: item.net_carbs_per_100g * per100,
    fat_g: item.fat_per_100g * per100,
    protein_g: item.protein_per_100g * per100,
  };
}

// Keeps the ratio, profile and glucose reading the result was made with, even if settings changed since.
export function recalculateResult(
  result: CalculationResult,
  items: CalculatedItem[],
  settings: Settings,
): CalculationResult {
  const dose = calculateDose(
    items,
    result.meal_window.ratio,
    settings,
    result.correction?.current_blood_sugar,
    result.correction?.iob ?? 0,
    1 + (result.profile?.percent ?? 0) / 100,
  );
  const { correction, fat_protein_adjustment, ...rest } = result;
  const next: CalculationResult = {
    ...rest,
    items,
    total_net_carbs_g: Math.round(dose.totalNetCarbs * 10) / 10,
    recommended_dose: dose.foodDose,
    total_dose: dose.totalDose,
  };
  if (dose.correction) next.correction = dose.correction;
  if (dose.fat_protein_adjustment) {
    next.fat_protein_adjustment = dose.fat_protein_adjustment;
  }
  return next;
}
