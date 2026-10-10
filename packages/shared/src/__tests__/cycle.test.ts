import { describe, expect, it } from "vitest";
import {
  cyclePhase,
  cyclePhaseRanges,
  cycleStatus,
  typicalInsulinResistance,
} from "../cycle.js";

const tracking = (start: string | null, length = 28) => ({
  enabled: true,
  last_period_start: start,
  length_days: length,
});

describe("cyclePhase", () => {
  it("splits a 28-day cycle into period, follicular, ovulation and luteal", () => {
    const phases = Array.from({ length: 28 }, (_, i) => cyclePhase(i + 1, 28));
    expect(phases.slice(0, 5).every((p) => p === "period")).toBe(true);
    expect(phases[5]).toBe("follicular");
    expect(phases[13]).toBe("ovulation");
    expect(phases[14]).toBe("luteal");
    expect(phases[27]).toBe("luteal");
  });

  it("keeps a 14-day luteal phase in longer cycles", () => {
    expect(cyclePhase(21, 35)).toBe("ovulation");
    expect(cyclePhase(22, 35)).toBe("luteal");
  });
});

describe("cyclePhaseRanges", () => {
  it("covers every day once and agrees with cyclePhase", () => {
    for (const length of [21, 28, 35, 45]) {
      const ranges = cyclePhaseRanges(length);
      expect(ranges.at(0)?.firstDay).toBe(1);
      expect(ranges.at(-1)?.lastDay).toBe(length);
      for (const range of ranges) {
        for (let day = range.firstDay; day <= range.lastDay; day++) {
          expect(cyclePhase(day, length)).toBe(range.phase);
        }
      }
      const days = ranges.reduce((n, r) => n + r.lastDay - r.firstDay + 1, 0);
      expect(days).toBe(length);
    }
  });
});

describe("typicalInsulinResistance", () => {
  const curve = (length: number) =>
    Array.from({ length }, (_, i) => typicalInsulinResistance(i + 1, length));
  const dayOfMax = (values: number[]) =>
    values.indexOf(Math.max(...values)) + 1;
  const dayOfMin = (values: number[]) =>
    values.indexOf(Math.min(...values)) + 1;

  it("peaks mid-luteal, about a week after ovulation", () => {
    expect(dayOfMax(curve(28))).toBe(21);
    expect(dayOfMax(curve(35))).toBe(28);
  });

  it("is lowest from the end of menses through the follicular phase", () => {
    const values = curve(28);
    const floor = Math.min(...values);
    expect(dayOfMin(values)).toBeLessThanOrEqual(5);
    for (let day = 5; day <= 13; day++) {
      expect(values.at(day - 1)).toBeCloseTo(floor, 2);
    }
  });

  it("stays raised through the late luteal phase and drops with menses", () => {
    const values = curve(28);
    const at = (day: number) => values.at(day - 1) ?? 0;
    expect(at(28)).toBeGreaterThan(0.6);
    expect(at(28)).toBeLessThan(at(21));
    expect(at(1)).toBeLessThan(at(28));
    expect(at(5)).toBeLessThan(at(1));
  });
});

describe("cycleStatus", () => {
  it("counts the start date as day 1", () => {
    const status = cycleStatus(tracking("2026-09-19"), new Date(2026, 8, 19));
    expect(status?.day).toBe(1);
    expect(status?.phaseStartsToday).toBe(true);
  });

  it("flags the first luteal day as a phase change", () => {
    const status = cycleStatus(tracking("2026-09-19"), new Date(2026, 9, 3));
    expect(status).toMatchObject({ day: 15, phase: "luteal" });
    expect(status?.phaseStartsToday).toBe(true);
  });

  it("wraps into the next cycle and predicts the next period", () => {
    const status = cycleStatus(tracking("2026-09-01"), new Date(2026, 9, 9));
    expect(status?.day).toBe(11);
    expect(status?.nextPeriod).toEqual(new Date(2026, 9, 27));
  });

  it("is null when disabled, unset or dated in the future", () => {
    expect(
      cycleStatus(
        { ...tracking("2026-09-01"), enabled: false },
        new Date(2026, 9, 9),
      ),
    ).toBeNull();
    expect(cycleStatus(tracking(null), new Date(2026, 9, 9))).toBeNull();
    expect(
      cycleStatus(tracking("2026-10-20"), new Date(2026, 9, 9)),
    ).toBeNull();
  });

  it("expects the period from three days before the predicted date", () => {
    const start = "2026-09-01";
    const on = (day: number) =>
      cycleStatus(tracking(start), new Date(2026, 8, day))?.periodExpected;
    expect(on(25)).toBe(false);
    expect(on(26)).toBe(true);
    expect(on(28)).toBe(true);
  });

  it("keeps expecting an unconfirmed period for three days after it was due", () => {
    const status = (day: number) =>
      cycleStatus(tracking("2026-09-01"), new Date(2026, 8, day));
    expect(status(29)).toMatchObject({ day: 1, periodExpected: true });
    expect(status(31)).toMatchObject({ day: 3, periodExpected: true });
    expect(status(32)).toMatchObject({ day: 4, periodExpected: false });
  });

  it("stops expecting the period once day 1 is logged", () => {
    const status = cycleStatus(tracking("2026-09-29"), new Date(2026, 8, 29));
    expect(status).toMatchObject({ day: 1, periodExpected: false });
  });
});
