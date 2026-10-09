import type { RatioFormat } from "./types.js";

const GRAMS_PER_RACION = 10;

export function toDisplayRatio(gramsPerUnit: number, format: RatioFormat) {
  return format === "units_per_10g"
    ? GRAMS_PER_RACION / gramsPerUnit
    : gramsPerUnit;
}

export function fromDisplayRatio(value: number, format: RatioFormat) {
  return format === "units_per_10g" ? GRAMS_PER_RACION / value : value;
}
