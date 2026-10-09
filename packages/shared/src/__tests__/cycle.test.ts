import { describe, expect, it } from "vitest";
import { cyclePhase, cycleStatus } from "../cycle.js";

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
});
