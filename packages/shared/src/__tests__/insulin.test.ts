import { describe, expect, it } from "vitest";
import {
  effectiveBolusModel,
  getBasalInsulinProfile,
  getBolusInsulinProfile,
  getInsulinProfile,
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
