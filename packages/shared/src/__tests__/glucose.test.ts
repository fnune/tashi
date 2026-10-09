import { describe, expect, it } from "vitest";
import { glucoseRange, latestRecentReading } from "../glucose.js";
import type { GlucoseEntry, TimelineEntry } from "../types.js";

const NOW = new Date("2026-06-13T12:00:00.000Z");

function reading(minutesAgo: number, value: number): GlucoseEntry {
  return {
    id: `g-${minutesAgo}`,
    type: "glucose_reading",
    timestamp: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(),
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
