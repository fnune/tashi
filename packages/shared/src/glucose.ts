import type { GlucoseEntry, GlucoseUnit, TimelineEntry } from "./types.js";

export const RECENT_READING_MINUTES = 30;

const RANGE_LIMITS: Record<GlucoseUnit, { low: number; high: number }> = {
  "mg/dL": { low: 70, high: 180 },
  "mmol/L": { low: 3.9, high: 10 },
};

export type GlucoseRange = "low" | "in_range" | "high";

export function glucoseRange(value: number, unit: GlucoseUnit): GlucoseRange {
  const { low, high } = RANGE_LIMITS[unit];
  if (value < low) return "low";
  if (value > high) return "high";
  return "in_range";
}

export function latestRecentReading(
  timeline: TimelineEntry[],
  now: Date,
): GlucoseEntry | null {
  const oldest = now.getTime() - RECENT_READING_MINUTES * 60_000;
  let latest: GlucoseEntry | null = null;
  for (const entry of timeline) {
    if (entry.type !== "glucose_reading") continue;
    const at = new Date(entry.timestamp).getTime();
    if (at < oldest || at > now.getTime()) continue;
    if (!latest || at > new Date(latest.timestamp).getTime()) latest = entry;
  }
  return latest;
}
