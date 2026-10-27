import type {
  FastInsulinEntry,
  GlucoseEntry,
  MealEntry,
  SlowInsulinEntry,
} from "@tashi/shared";
import { describe, expect, it } from "vitest";
import {
  applyTimelineUpdate,
  fastInsulinEntries,
  logMeal,
} from "../domain/timeline.js";
import { sequentialIds } from "./sequential-ids.js";

const fast: FastInsulinEntry = {
  id: "f",
  timestamp: "2026-06-13T10:00:00.000Z",
  time_zone: "Europe/Berlin",
  type: "fast_insulin",
  units: 4,
  insulin_id: "novorapid",
  related_meal_id: null,
};
const slow: SlowInsulinEntry = {
  id: "s",
  timestamp: "2026-06-13T08:00:00.000Z",
  time_zone: "Europe/Berlin",
  type: "slow_insulin",
  units: 10,
  insulin_id: "tresiba",
};
const glucose: GlucoseEntry = {
  id: "g",
  timestamp: "2026-06-13T09:00:00.000Z",
  time_zone: "Europe/Berlin",
  type: "glucose_reading",
  value: 120,
  unit: "mg/dL",
};

describe("timeline rules", () => {
  it("keeps only fast insulin for insulin on board", () => {
    expect(fastInsulinEntries([slow, fast, glucose])).toEqual([fast]);
  });

  it("changes only the fields the update names and leaves the original alone", () => {
    const update = applyTimelineUpdate(fast, {
      type: "fast_insulin",
      units: 6,
    });
    expect(update).toEqual({
      status: "updated",
      entry: { ...fast, units: 6 },
    });
    expect(fast.units).toBe(4);
  });

  it("refuses to turn one kind of entry into another", () => {
    expect(
      applyTimelineUpdate(fast, { type: "glucose_reading", value: 100 }),
    ).toEqual({ status: "type_mismatch" });
  });

  it("refuses a glucose value that is not plausible in the entry's unit", () => {
    expect(
      applyTimelineUpdate(glucose, { type: "glucose_reading", value: 5 }),
    ).toEqual({ status: "implausible_value" });
    expect(
      applyTimelineUpdate(
        { ...glucose, unit: "mmol/L", value: 6 },
        { type: "glucose_reading", value: 6.5 },
      ).status,
    ).toBe("updated");
  });

  it("moves a meal in time and nothing else", () => {
    const meal = {
      id: "m",
      type: "meal",
      timestamp: fast.timestamp,
    } as MealEntry;
    expect(
      applyTimelineUpdate(meal, {
        type: "meal",
        timestamp: "2026-06-13T11:00:00.000Z",
      }),
    ).toEqual({
      status: "updated",
      entry: { ...meal, timestamp: "2026-06-13T11:00:00.000Z" },
    });
  });
});

describe("logging a meal", () => {
  const result = {
    input_text: "rice",
    language: "en" as const,
    meal_window: { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    items: [],
    total_net_carbs_g: 30,
    recommended_dose: 3,
    total_dose: 3,
  };
  const now = new Date("2026-06-13T12:00:00.000Z");

  it("dates the meal after the pre-bolus but the insulin now", () => {
    const { meal, insulin } = logMeal(
      result,
      3,
      15,
      "novorapid",
      now,
      sequentialIds(),
      "Europe/Berlin",
    );
    expect(meal.timestamp).toBe("2026-06-13T12:15:00.000Z");
    expect(insulin?.timestamp).toBe("2026-06-13T12:00:00.000Z");
    expect(insulin?.related_meal_id).toBe(meal.id);
  });

  it("records the zone the user was in on both entries", () => {
    const { meal, insulin } = logMeal(
      result,
      3,
      0,
      "novorapid",
      now,
      sequentialIds(),
      "Asia/Tokyo",
    );
    expect(meal.time_zone).toBe("Asia/Tokyo");
    expect(insulin?.time_zone).toBe("Asia/Tokyo");
  });

  it("logs no insulin entry for a zero dose", () => {
    expect(
      logMeal(result, 0, 0, "novorapid", now, sequentialIds(), "Europe/Berlin")
        .insulin,
    ).toBeNull();
  });
});
