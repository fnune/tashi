import { describe, expect, it } from "vitest";
import {
  effectiveBolusModel,
  getBasalInsulinProfile,
  getBolusInsulinProfile,
  getInsulinProfile,
  insulinActivityFraction,
  insulinOnBoard,
  insulinRemainingFraction,
} from "../insulin.js";
import type { FastInsulinEntry, Settings } from "../types.js";

const SETTINGS: Settings = {
  meal_windows: [{ name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 }],
  correction_factor: 40,
  target_blood_sugar: 100,
  glucose_unit: "mg/dL",
  pen_increment: 0.5,
  fat_protein_multiplier: 0.2,
  bolus_insulin_id: "novorapid",
  basal_insulin_id: "tresiba",
  insulin_action_minutes: 300,
  language: "en",
};

const NOW = new Date("2026-06-13T12:00:00.000Z");

function fastEntry(
  overrides: Partial<FastInsulinEntry> = {},
): FastInsulinEntry {
  return {
    id: "entry-1",
    timestamp: NOW.toISOString(),
    type: "fast_insulin",
    units: 5,
    insulin_id: "novorapid",
    related_meal_id: null,
    ...overrides,
  };
}

function minutesAgo(min: number): string {
  return new Date(NOW.getTime() - min * 60_000).toISOString();
}

describe("insulinRemainingFraction (NovoRapid: peak 75, duration 300)", () => {
  it("is fully active at injection time", () => {
    expect(insulinRemainingFraction(0, 75, 300)).toBe(1);
  });

  it("is exhausted at and beyond the duration", () => {
    expect(insulinRemainingFraction(300, 75, 300)).toBe(0);
    expect(insulinRemainingFraction(400, 75, 300)).toBe(0);
  });

  it("matches the exponential model at known elapsed times", () => {
    expect(insulinRemainingFraction(75, 75, 300)).toBeCloseTo(0.673, 2);
    expect(insulinRemainingFraction(150, 75, 300)).toBeCloseTo(0.268, 2);
    expect(insulinRemainingFraction(240, 75, 300)).toBeCloseTo(0.033, 2);
  });

  it("decreases monotonically across the action window", () => {
    let prev = insulinRemainingFraction(1, 75, 300);
    for (let t = 30; t < 300; t += 30) {
      const current = insulinRemainingFraction(t, 75, 300);
      expect(current).toBeLessThan(prev);
      prev = current;
    }
  });

  it("delivers the whole dose over the action window (area under activity ~= 1)", () => {
    const peak = 75;
    const duration = 300;
    const steps = 10_000;
    const dt = duration / steps;
    let delivered = 0;
    for (let i = 0; i < steps; i++) {
      const t = i * dt;
      delivered +=
        insulinRemainingFraction(t, peak, duration) -
        insulinRemainingFraction(t + dt, peak, duration);
    }
    expect(delivered).toBeCloseTo(1, 3);
  });

  it("rejects a peak at or beyond half the duration instead of returning NaN", () => {
    expect(() => insulinRemainingFraction(60, 150, 300)).toThrow(
      /less than half the duration/i,
    );
    expect(() => insulinRemainingFraction(60, 200, 300)).toThrow(
      /less than half the duration/i,
    );
  });
});

describe("insulinActivityFraction (NovoRapid: peak 75, duration 300)", () => {
  it("is zero at and beyond the action window boundaries", () => {
    expect(insulinActivityFraction(0, 75, 300)).toBe(0);
    expect(insulinActivityFraction(300, 75, 300)).toBe(0);
    expect(insulinActivityFraction(400, 75, 300)).toBe(0);
  });

  it("peaks at the configured peak time", () => {
    let argmax = 0;
    let max = -1;
    for (let t = 1; t < 300; t += 1) {
      const activity = insulinActivityFraction(t, 75, 300);
      if (activity > max) {
        max = activity;
        argmax = t;
      }
    }
    expect(argmax).toBeCloseTo(75, -1);
  });

  it("integrates to the whole dose over the action window", () => {
    const steps = 10_000;
    const dt = 300 / steps;
    let area = 0;
    for (let i = 0; i < steps; i++) {
      area += insulinActivityFraction((i + 0.5) * dt, 75, 300) * dt;
    }
    expect(area).toBeCloseTo(1, 3);
  });

  it("equals the negative slope of the remaining-fraction curve", () => {
    const h = 0.01;
    for (const t of [30, 75, 120, 200, 270]) {
      const slope =
        (insulinRemainingFraction(t + h, 75, 300) -
          insulinRemainingFraction(t - h, 75, 300)) /
        (2 * h);
      expect(insulinActivityFraction(t, 75, 300)).toBeCloseTo(-slope, 6);
    }
  });

  it("rejects a peak at or beyond half the duration instead of returning NaN", () => {
    expect(() => insulinActivityFraction(60, 150, 300)).toThrow(
      /less than half the duration/i,
    );
  });
});

describe("insulinOnBoard", () => {
  it("counts a fresh dose at full units", () => {
    const iob = insulinOnBoard(
      [fastEntry({ timestamp: NOW.toISOString() })],
      SETTINGS,
      NOW,
    );
    expect(iob.total_units).toBeCloseTo(5, 5);
    expect(iob.contributions).toHaveLength(1);
  });

  it("excludes doses older than the duration of action", () => {
    const iob = insulinOnBoard(
      [fastEntry({ timestamp: minutesAgo(301) })],
      SETTINGS,
      NOW,
    );
    expect(iob.total_units).toBe(0);
    expect(iob.contributions).toHaveLength(0);
  });

  it("sums remaining insulin across multiple doses", () => {
    const iob = insulinOnBoard(
      [
        fastEntry({ id: "a", units: 4, timestamp: minutesAgo(75) }),
        fastEntry({ id: "b", units: 6, timestamp: minutesAgo(150) }),
      ],
      SETTINGS,
      NOW,
    );
    expect(iob.total_units).toBeCloseTo(4 * 0.673 + 6 * 0.268, 2);
    expect(iob.contributions.map((c) => c.entry_id)).toEqual(["a", "b"]);
  });

  it("applies a shorter DIA from settings", () => {
    const shortDia: Settings = { ...SETTINGS, insulin_action_minutes: 180 };
    const iob = insulinOnBoard(
      [fastEntry({ timestamp: minutesAgo(200) })],
      shortDia,
      NOW,
    );
    expect(iob.total_units).toBe(0);
  });

  it("ignores out-of-window legacy entries that lack an insulin id", () => {
    const legacy = {
      ...fastEntry({ timestamp: minutesAgo(5000) }),
      insulin_id: undefined as unknown as FastInsulinEntry["insulin_id"],
    };
    const fresh = fastEntry({ id: "fresh", timestamp: NOW.toISOString() });
    const iob = insulinOnBoard([legacy, fresh], SETTINGS, NOW);
    expect(iob.total_units).toBeCloseTo(5, 5);
    expect(iob.contributions.map((c) => c.entry_id)).toEqual(["fresh"]);
  });

  it("throws when no duration of insulin action is configured", () => {
    const unset: Settings = { ...SETTINGS, insulin_action_minutes: null };
    expect(() => insulinOnBoard([fastEntry()], unset, NOW)).toThrow(
      /duration of insulin action/i,
    );
  });
});

describe("insulin profile lookup", () => {
  it("throws on an unknown insulin id", () => {
    expect(() => getInsulinProfile("humalog")).toThrow(/unknown insulin/i);
  });

  it("rejects a basal insulin where a bolus is required", () => {
    expect(() => getBolusInsulinProfile("tresiba")).toThrow(/not bolus/i);
  });

  it("rejects a bolus insulin where a basal is required", () => {
    expect(() => getBasalInsulinProfile("novorapid")).toThrow(/not basal/i);
  });
});

describe("effectiveBolusModel", () => {
  it("resolves the configured insulin with the DIA override", () => {
    const model = effectiveBolusModel(SETTINGS);
    expect(model.peak_minutes).toBe(75);
    expect(model.duration_minutes).toBe(300);
  });

  it("throws when no bolus insulin is configured", () => {
    const unset: Settings = { ...SETTINGS, bolus_insulin_id: null };
    expect(() => effectiveBolusModel(unset)).toThrow(/no bolus insulin/i);
  });
});
