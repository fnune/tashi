import { describe, expect, it } from "vitest";
import {
  activeProfile,
  appliedProfile,
  doseScale,
  effectiveRatio,
  renameWindowInProfiles,
  windowRatio,
} from "../profiles.js";
import { DEFAULT_SETTINGS, type Profile, type Settings } from "../types.js";

const LUNCH = { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 };

const percent = (value: number): Profile => ({
  id: "p",
  name: "P",
  emoji: "⭐",
  adjustment: { mode: "percent", percent: value },
});

describe("profiles", () => {
  it("falls back to Normal when the active profile is gone", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      active_profile_id: "deleted",
    };
    expect(activeProfile(settings).id).toBe("normal");
  });

  it("seeds Normal plus sport, sick-day and menstruation examples", () => {
    expect(DEFAULT_SETTINGS.profiles.map((p) => [p.id, doseScale(p)])).toEqual([
      ["normal", 1],
      ["sport", 0.8],
      ["sick", 1.2],
      ["menstruation", 1.15],
    ]);
  });

  it("scales by the percentage and leaves ratios alone", () => {
    expect(doseScale(percent(15))).toBeCloseTo(1.15);
    expect(effectiveRatio(percent(15), LUNCH)).toBe(10);
  });

  it("swaps in per-window ratios without scaling", () => {
    const perWindow: Profile = {
      ...percent(0),
      adjustment: { mode: "per_window", ratios: { lunch: 8 } },
    };
    expect(effectiveRatio(perWindow, LUNCH)).toBe(8);
    expect(doseScale(perWindow)).toBe(1);
    expect(appliedProfile(perWindow).percent).toBe(0);
  });

  it("carries per-window ratios over when a window is renamed", () => {
    const perWindow: Profile = {
      ...percent(0),
      adjustment: { mode: "per_window", ratios: { lunch: 8, dinner: 6 } },
    };
    const [renamed] = renameWindowInProfiles([perWindow], "lunch", "Comida");
    expect(renamed?.adjustment).toEqual({
      mode: "per_window",
      ratios: { Comida: 8, dinner: 6 },
    });
  });

  it("shows a percentage profile as the ratio giving the same meal dose", () => {
    const view = windowRatio(percent(-20), LUNCH);
    expect(view.modifier).toEqual({ kind: "percent", percent: -20 });
    expect(view.result).toBeCloseTo(12.5);
    expect(50 / view.result).toBeCloseTo((50 / LUNCH.ratio) * 0.8);
  });

  it("shows a per-window profile's own ratio, or no change where it has none", () => {
    const perWindow: Profile = {
      ...percent(0),
      adjustment: { mode: "per_window", ratios: { lunch: 8 } },
    };
    expect(windowRatio(perWindow, LUNCH)).toEqual({
      base: 10,
      modifier: { kind: "own" },
      result: 8,
    });
    expect(
      windowRatio(perWindow, { ...LUNCH, name: "dinner" }).modifier.kind,
    ).toBe("none");
  });

  it("shows no modifier for Normal", () => {
    expect(windowRatio(percent(0), LUNCH)).toEqual({
      base: 10,
      modifier: { kind: "none" },
      result: 10,
    });
  });
});
