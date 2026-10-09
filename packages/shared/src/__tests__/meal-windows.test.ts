import { describe, expect, it } from "vitest";
import { uncoveredHours } from "../calculation.js";
import {
  allowedEndHours,
  allowedStartHours,
  extendWindowOverGap,
  mergeWindowIntoPrevious,
  moveWindowEnd,
  moveWindowStart,
  splitLongestWindow,
} from "../meal-windows.js";
import type { MealWindow } from "../types.js";

const DAY: MealWindow[] = [
  { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
  { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
  { name: "dinner", start_hour: 16, end_hour: 6, ratio: 12 },
];

const spans = (windows: MealWindow[]) =>
  windows.map((w) => [w.name, w.start_hour, w.end_hour]);

describe("meal window editing", () => {
  it("moves the previous window's end along with a start", () => {
    const moved = moveWindowStart(DAY, 1, 12);
    expect(spans(moved)).toEqual([
      ["morning", 6, 12],
      ["lunch", 12, 16],
      ["dinner", 16, 6],
    ]);
  });

  it("moves the next window's start along with an end, across midnight", () => {
    const moved = moveWindowEnd(DAY, 2, 7);
    expect(spans(moved)).toEqual([
      ["morning", 7, 11],
      ["lunch", 11, 16],
      ["dinner", 16, 7],
    ]);
  });

  it("only offers hours that leave both neighbours non-empty", () => {
    expect(allowedStartHours(DAY, 1)).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(allowedEndHours(DAY, 2)).toEqual([
      17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it("offers no boundaries to move when one window spans the day", () => {
    const single = [{ name: "all", start_hour: 0, end_hour: 0, ratio: 10 }];
    expect(allowedStartHours(single, 0)).toEqual([]);
    expect(allowedEndHours(single, 0)).toEqual([]);
  });

  it("splits the longest window in half, keeping its ratio", () => {
    const { windows, addedIndex } = splitLongestWindow(DAY);
    expect(spans(windows)).toEqual([
      ["morning", 6, 11],
      ["lunch", 11, 16],
      ["dinner", 16, 23],
      ["", 23, 6],
    ]);
    expect(windows[addedIndex]?.ratio).toBe(12);
  });

  it("hands a removed window's hours to the previous one", () => {
    expect(spans(mergeWindowIntoPrevious(DAY, 1))).toEqual([
      ["morning", 6, 16],
      ["dinner", 16, 6],
    ]);
  });

  it("keeps the last window, which then spans the whole day", () => {
    const one = mergeWindowIntoPrevious(mergeWindowIntoPrevious(DAY, 2), 1);
    expect(spans(one)).toEqual([["morning", 6, 6]]);
    expect(mergeWindowIntoPrevious(one, 0)).toBe(one);
    expect(uncoveredHours(one)).toEqual([]);
  });

  it("closes a gap by extending the window before it", () => {
    const withGap = DAY.map((w) =>
      w.name === "dinner" ? { ...w, end_hour: 23 } : w,
    );
    const [gap] = uncoveredHours(withGap);
    if (!gap) throw new Error("expected a gap");
    expect(uncoveredHours(extendWindowOverGap(withGap, gap))).toEqual([]);
  });

  it("never leaves hours uncovered", () => {
    let windows = DAY;
    windows = moveWindowStart(windows, 0, 3);
    windows = splitLongestWindow(windows).windows;
    windows = mergeWindowIntoPrevious(windows, 1);
    windows = moveWindowEnd(windows, 0, 14);
    expect(uncoveredHours(windows)).toEqual([]);
  });
});
