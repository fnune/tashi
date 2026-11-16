import { describe, expect, it } from "vitest";
import type { CalculatorFormState } from "./components/CalculatorView.js";
import {
  KEEP_PENDING_FOR_MS,
  type KeyValueStore,
  PENDING_CALCULATION_KEY,
  restorePendingCalculation,
  savePendingCalculation,
} from "./pending-calculation.js";

function memoryStore(): KeyValueStore & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

const CALCULATED_AT = new Date("2026-10-31T12:05:00.000Z");

const pending: CalculatorFormState = {
  foodText: "arroz con pollo",
  preBolusMinutes: 10,
  units: 4.5,
  calculatedAt: CALCULATED_AT.toISOString(),
  injectedAt: null,
  result: {
    id: "calc-1",
    timestamp: "2026-10-31T12:05:00.000Z",
    input_text: "arroz con pollo",
    language: "es",
    meal_window: { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
    items: [],
    total_net_carbs_g: 45,
    carb_dose: 4.5,
    total_dose: 4.5,
  },
};

const later = (ms: number) => new Date(CALCULATED_AT.getTime() + ms);

describe("a calculation that was not logged", () => {
  it("comes back after the page is opened again", () => {
    const store = memoryStore();
    savePendingCalculation(store, pending);
    expect(restorePendingCalculation(store, later(45 * 60_000))).toEqual(
      pending,
    );
  });

  it("is forgotten once it is logged or cleared", () => {
    const store = memoryStore();
    savePendingCalculation(store, pending);
    savePendingCalculation(store, { ...pending, result: null });
    expect(store.items.has(PENDING_CALCULATION_KEY)).toBe(false);
  });

  it("is dropped when too old to dose from", () => {
    const store = memoryStore();
    savePendingCalculation(store, pending);
    expect(
      restorePendingCalculation(store, later(KEEP_PENDING_FOR_MS + 1)),
    ).toBeNull();
    expect(store.items.has(PENDING_CALCULATION_KEY)).toBe(false);
  });

  it("is dropped when what was saved cannot be read", () => {
    const store = memoryStore();
    store.setItem(PENDING_CALCULATION_KEY, "{not json");
    expect(restorePendingCalculation(store, later(0))).toBeNull();
    store.setItem(PENDING_CALCULATION_KEY, JSON.stringify({ result: 1 }));
    expect(restorePendingCalculation(store, later(0))).toBeNull();
  });
});
