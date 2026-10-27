import type { GlucoseEntry, GlucoseUnit, TimelineEntry } from "./types.js";

export const RECENT_READING_MINUTES = 30;

export const GLUCOSE_RANGE_LIMITS: Record<
  GlucoseUnit,
  { low: number; high: number }
> = {
  "mg/dL": { low: 70, high: 180 },
  "mmol/L": { low: 3.9, high: 10 },
};

export const GLUCOSE_ENTRY_LIMITS: Record<
  GlucoseUnit,
  { min: number; max: number }
> = {
  "mg/dL": { min: 20, max: 600 },
  "mmol/L": { min: 1.1, max: 33.3 },
};

export function isPlausibleGlucose(value: number, unit: GlucoseUnit): boolean {
  const { min, max } = GLUCOSE_ENTRY_LIMITS[unit];
  return value >= min && value <= max;
}

export const GLUCOSE_GAUGE_SCALE: Record<
  GlucoseUnit,
  { min: number; max: number }
> = {
  "mg/dL": { min: 40, max: 400 },
  "mmol/L": { min: 2.2, max: 22.2 },
};

export type GlucoseRange = "low" | "in_range" | "high";

export function glucoseRange(value: number, unit: GlucoseUnit): GlucoseRange {
  const { low, high } = GLUCOSE_RANGE_LIMITS[unit];
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

export const MG_DL_PER_MMOL_L = 18.016;

export function convertGlucose(
  value: number,
  from: GlucoseUnit,
  to: GlucoseUnit,
): number {
  if (from === to) return value;
  return from === "mmol/L"
    ? value * MG_DL_PER_MMOL_L
    : value / MG_DL_PER_MMOL_L;
}
