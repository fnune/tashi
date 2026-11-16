import type {
  BolusInsulinId,
  CalculationResult,
  FastInsulinEntry,
  MealEntry,
  TimelineEntry,
  UpdateTimelineRequest,
} from "@tashi/shared";
import { isPlausibleGlucose } from "@tashi/shared";
import type { IdGenerator } from "./ids.js";

export function fastInsulinEntries(
  timeline: TimelineEntry[],
): FastInsulinEntry[] {
  return timeline.filter(
    (e): e is FastInsulinEntry => e.type === "fast_insulin",
  );
}

export type TimelineUpdate =
  | { status: "updated"; entry: TimelineEntry }
  | { status: "type_mismatch" }
  | { status: "implausible_value" };

export function applyTimelineUpdate(
  existing: TimelineEntry,
  updates: UpdateTimelineRequest,
): TimelineUpdate {
  if (existing.type !== updates.type) return { status: "type_mismatch" };

  const timestamp = updates.timestamp ?? existing.timestamp;
  switch (existing.type) {
    case "fast_insulin":
    case "slow_insulin": {
      const units = "units" in updates ? updates.units : undefined;
      return {
        status: "updated",
        entry: { ...existing, timestamp, units: units ?? existing.units },
      };
    }
    case "glucose_reading": {
      const value = "value" in updates ? updates.value : undefined;
      if (value !== undefined && !isPlausibleGlucose(value, existing.unit)) {
        return { status: "implausible_value" };
      }
      return {
        status: "updated",
        entry: { ...existing, timestamp, value: value ?? existing.value },
      };
    }
    case "meal":
      return { status: "updated", entry: { ...existing, timestamp } };
  }
}

export interface LoggedMeal {
  meal: MealEntry;
  insulin: FastInsulinEntry | null;
}

export type LoggableMeal = Pick<
  CalculationResult,
  | "input_text"
  | "language"
  | "meal_window"
  | "items"
  | "total_net_carbs_g"
  | "carb_dose"
  | "correction"
  | "fat_protein_adjustment"
  | "trace"
> & { total_dose: number };

export function logMeal(
  result: LoggableMeal,
  units: number,
  preBolusMinutes: number,
  bolusInsulinId: BolusInsulinId,
  injectedAt: Date,
  newId: IdGenerator,
  timeZone: string,
): LoggedMeal {
  const meal: MealEntry = {
    id: newId(),
    timestamp: new Date(
      injectedAt.getTime() + preBolusMinutes * 60_000,
    ).toISOString(),
    time_zone: timeZone,
    type: "meal",
    input_text: result.input_text,
    language: result.language,
    meal_window: result.meal_window,
    items: result.items,
    total_net_carbs_g: result.total_net_carbs_g,
    carb_dose: result.carb_dose,
    total_dose: result.total_dose,
    correction: result.correction,
    fat_protein_adjustment: result.fat_protein_adjustment,
    trace: result.trace,
  };
  const insulin: FastInsulinEntry | null =
    units > 0
      ? {
          id: newId(),
          timestamp: injectedAt.toISOString(),
          time_zone: timeZone,
          type: "fast_insulin",
          units,
          insulin_id: bolusInsulinId,
          related_meal_id: meal.id,
        }
      : null;
  return { meal, insulin };
}
