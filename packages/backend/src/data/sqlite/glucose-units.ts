import type { GlucoseUnit } from "@tashi/shared";
import { convertGlucose } from "@tashi/shared";

const DECIMALS = 6;

export function toMgDl(value: number, unit: GlucoseUnit): number {
  return convertGlucose(value, unit, "mg/dL");
}

export function fromMgDl(value: number, unit: GlucoseUnit): number {
  const converted = convertGlucose(value, "mg/dL", unit);
  const scale = 10 ** DECIMALS;
  return Math.round(converted * scale) / scale;
}
