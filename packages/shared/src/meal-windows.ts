import type { HourRange } from "./calculation.js";
import type { MealWindow } from "./types.js";

const HOURS_PER_DAY = 24;

function wrap(hour: number): number {
  return ((hour % HOURS_PER_DAY) + HOURS_PER_DAY) % HOURS_PER_DAY;
}

export function windowLength(window: HourRange): number {
  return wrap(window.end_hour - window.start_hour) || HOURS_PER_DAY;
}

export function sortByStart(windows: MealWindow[]): MealWindow[] {
  return [...windows].sort((a, b) => a.start_hour - b.start_hour);
}

function neighbours(windows: MealWindow[], index: number) {
  const count = windows.length;
  return {
    previous: (index - 1 + count) % count,
    next: (index + 1) % count,
  };
}

function hoursBetween(from: number, to: number): number[] {
  const hours: number[] = [];
  for (let hour = wrap(from + 1); hour !== wrap(to); hour = wrap(hour + 1)) {
    hours.push(hour);
  }
  return hours;
}

export function allowedStartHours(
  windows: MealWindow[],
  index: number,
): number[] {
  const { previous } = neighbours(windows, index);
  const window = windows[index];
  const previousWindow = windows[previous];
  if (!window || !previousWindow || windows.length < 2) return [];
  return hoursBetween(previousWindow.start_hour, window.end_hour);
}

export function allowedEndHours(
  windows: MealWindow[],
  index: number,
): number[] {
  const { next } = neighbours(windows, index);
  const window = windows[index];
  const nextWindow = windows[next];
  if (!window || !nextWindow || windows.length < 2) return [];
  return hoursBetween(window.start_hour, nextWindow.end_hour);
}

function replaceAt(
  windows: MealWindow[],
  changes: Record<number, Partial<MealWindow>>,
): MealWindow[] {
  return windows.map((window, i) =>
    changes[i] ? { ...window, ...changes[i] } : window,
  );
}

export function moveWindowStart(
  windows: MealWindow[],
  index: number,
  hour: number,
): MealWindow[] {
  const { previous } = neighbours(windows, index);
  return replaceAt(windows, {
    [previous]: { end_hour: hour },
    [index]: { start_hour: hour },
  });
}

export function moveWindowEnd(
  windows: MealWindow[],
  index: number,
  hour: number,
): MealWindow[] {
  const { next } = neighbours(windows, index);
  return replaceAt(windows, {
    [index]: { end_hour: hour },
    [next]: { start_hour: hour },
  });
}

export function splitLongestWindow(windows: MealWindow[]): {
  windows: MealWindow[];
  addedIndex: number;
} {
  const sorted = sortByStart(windows);
  const longest = sorted.reduce(
    (best, window, i) =>
      windowLength(window) > windowLength(sorted[best] as MealWindow)
        ? i
        : best,
    0,
  );
  const target = sorted[longest];
  if (!target || windowLength(target) < 2) {
    return { windows: sorted, addedIndex: -1 };
  }
  const middle = wrap(target.start_hour + Math.floor(windowLength(target) / 2));
  const added: MealWindow = {
    name: "",
    start_hour: middle,
    end_hour: target.end_hour,
    ratio: target.ratio,
  };
  const next = [...sorted];
  next[longest] = { ...target, end_hour: middle };
  next.splice(longest + 1, 0, added);
  return { windows: next, addedIndex: longest + 1 };
}

export function mergeWindowIntoPrevious(
  windows: MealWindow[],
  index: number,
): MealWindow[] {
  const removed = windows[index];
  if (!removed || windows.length < 2) return windows;
  const { previous } = neighbours(windows, index);
  return replaceAt(windows, {
    [previous]: { end_hour: removed.end_hour },
  }).filter((_, i) => i !== index);
}

export function extendWindowOverGap(
  windows: MealWindow[],
  gap: HourRange,
): MealWindow[] {
  const before = windows.findIndex(
    (w) => wrap(w.end_hour) === wrap(gap.start_hour),
  );
  if (before === -1) return windows;
  return replaceAt(windows, { [before]: { end_hour: gap.end_hour } });
}
