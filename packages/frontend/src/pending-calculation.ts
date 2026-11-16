import type { CalculatorFormState } from "./components/CalculatorView.js";

export const PENDING_CALCULATION_KEY = "tashi-pending-calculation";
export const KEEP_PENDING_FOR_MS = 12 * 60 * 60_000;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function savePendingCalculation(
  store: KeyValueStore,
  form: CalculatorFormState,
): void {
  if (form.result && form.calculatedAt) {
    store.setItem(PENDING_CALCULATION_KEY, JSON.stringify(form));
  } else {
    store.removeItem(PENDING_CALCULATION_KEY);
  }
}

export function restorePendingCalculation(
  store: KeyValueStore,
  now: Date,
): CalculatorFormState | null {
  const text = store.getItem(PENDING_CALCULATION_KEY);
  if (text === null) return null;
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    store.removeItem(PENDING_CALCULATION_KEY);
    return null;
  }
  if (
    !isPendingCalculation(saved) ||
    now.getTime() - Date.parse(saved.calculatedAt) > KEEP_PENDING_FOR_MS
  ) {
    store.removeItem(PENDING_CALCULATION_KEY);
    return null;
  }
  return saved;
}

function isPendingCalculation(
  value: unknown,
): value is CalculatorFormState & { calculatedAt: string } {
  if (typeof value !== "object" || value === null) return false;
  const form: Partial<Record<keyof CalculatorFormState, unknown>> = value;
  const result: unknown = form.result;
  return (
    typeof form.foodText === "string" &&
    typeof form.preBolusMinutes === "number" &&
    typeof form.units === "number" &&
    typeof form.calculatedAt === "string" &&
    !Number.isNaN(Date.parse(form.calculatedAt)) &&
    (form.injectedAt === null || typeof form.injectedAt === "string") &&
    typeof result === "object" &&
    result !== null &&
    "items" in result &&
    Array.isArray(result.items) &&
    "carb_units" in result &&
    typeof result.carb_units === "number"
  );
}
