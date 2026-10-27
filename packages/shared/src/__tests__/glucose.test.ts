import { describe, expect, it } from "vitest";
import {
  convertGlucose,
  glucoseRange,
  latestRecentReading,
} from "../glucose.js";
import type { GlucoseEntry, TimelineEntry } from "../types.js";

const NOW = new Date("2026-06-13T12:00:00.000Z");

function reading(minutesAgo: number, value: number): GlucoseEntry {
  return {
    id: `g-${minutesAgo}`,
    type: "glucose_reading",
    timestamp: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
    time_zone: "Europe/Berlin",
    value,
    unit: "mg/dL",
  };
}

describe("latestRecentReading", () => {
  it("picks the newest reading from the last 30 minutes", () => {
    const timeline: TimelineEntry[] = [reading(25, 150), reading(5, 120)];
    expect(latestRecentReading(timeline, NOW)?.value).toBe(120);
  });

  it("ignores readings older than 30 minutes", () => {
    expect(latestRecentReading([reading(31, 150)], NOW)).toBeNull();
  });

  it("ignores readings dated in the future", () => {
    expect(latestRecentReading([reading(-5, 150)], NOW)).toBeNull();
  });
});

describe("glucoseRange", () => {
  it("uses 70 to 180 mg/dL as the target range", () => {
    expect(glucoseRange(69, "mg/dL")).toBe("low");
    expect(glucoseRange(70, "mg/dL")).toBe("in_range");
    expect(glucoseRange(180, "mg/dL")).toBe("in_range");
    expect(glucoseRange(181, "mg/dL")).toBe("high");
  });

  it("uses 3.9 to 10 mmol/L as the target range", () => {
    expect(glucoseRange(3.8, "mmol/L")).toBe("low");
    expect(glucoseRange(10.1, "mmol/L")).toBe("high");
  });
});

describe("glucose conversion", () => {
  it("converts between units and back without drift", () => {
    expect(convertGlucose(5.5, "mmol/L", "mg/dL")).toBeCloseTo(99.088, 3);
    expect(convertGlucose(100, "mg/dL", "mmol/L")).toBeCloseTo(5.55, 2);
    for (const mmol of [3.9, 5.6, 6.4, 10, 33.3]) {
      const back = convertGlucose(
        convertGlucose(mmol, "mmol/L", "mg/dL"),
        "mg/dL",
        "mmol/L",
      );
      expect(back).toBeCloseTo(mmol, 9);
    }
  });

  it("leaves a value alone when the unit does not change", () => {
    expect(convertGlucose(123, "mg/dL", "mg/dL")).toBe(123);
  });
});
