import type { CycleTracking } from "./types.js";

export type CyclePhase = "period" | "follicular" | "ovulation" | "luteal";

const PERIOD_DAYS = 5;
const PERIOD_PROMPT_WINDOW_DAYS = 3;
const LUTEAL_PHASE_DAYS = 14;
const DAY_MS = 86_400_000;

export const MIN_CYCLE_DAYS = 21;
export const MAX_CYCLE_DAYS = 45;

export interface CycleStatus {
  day: number;
  length: number;
  phase: CyclePhase;
  phaseStartsToday: boolean;
  periodExpected: boolean;
  nextPeriod: Date;
}

function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function ovulationDay(length: number): number {
  return length - LUTEAL_PHASE_DAYS;
}

export function cyclePhase(day: number, length: number): CyclePhase {
  if (day <= PERIOD_DAYS) return "period";
  const ovulation = ovulationDay(length);
  if (day < ovulation) return "follicular";
  if (day === ovulation) return "ovulation";
  return "luteal";
}

export interface CyclePhaseRange {
  phase: CyclePhase;
  firstDay: number;
  lastDay: number;
}

export function cyclePhaseRanges(length: number): CyclePhaseRange[] {
  const ovulation = ovulationDay(length);
  return [
    { phase: "period", firstDay: 1, lastDay: PERIOD_DAYS },
    { phase: "follicular", firstDay: PERIOD_DAYS + 1, lastDay: ovulation - 1 },
    { phase: "ovulation", firstDay: ovulation, lastDay: ovulation },
    { phase: "luteal", firstDay: ovulation + 1, lastDay: length },
  ];
}

const RESISTANCE_FLOOR = 0.1;
const RESISTANCE_PEAK_AFTER_OVULATION = 7;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Relative insulin resistance from 0 to 1 by cycle day, shaped after the
// population pattern in Hossmann et al., Diabetes Care 2026 (77 women, 380
// cycles): lowest in the early follicular phase, rising after ovulation,
// highest mid-luteal and still raised until menses. Individuals vary.
export function typicalInsulinResistance(day: number, length: number): number {
  const ovulation = ovulationDay(length);
  const peak = ovulation + RESISTANCE_PEAK_AFTER_OVULATION;
  const menstrualCarryover = 0.25 * (1 - smoothstep(1, PERIOD_DAYS, day));
  const rise = smoothstep(ovulation, peak, day);
  const lateLutealEasing = 0.25 * smoothstep(peak, length, day);
  const level = Math.max(menstrualCarryover, rise - lateLutealEasing);
  return RESISTANCE_FLOOR + (1 - RESISTANCE_FLOOR) * level;
}

export function cycleStatus(
  cycle: CycleTracking,
  today: Date,
): CycleStatus | null {
  if (!cycle.enabled || !cycle.last_period_start) return null;
  const start = parseLocalDate(cycle.last_period_start);
  const length = cycle.length_days;
  const elapsed = Math.round(
    (startOfDay(today).getTime() - start.getTime()) / DAY_MS,
  );
  if (elapsed < 0) return null;
  const cyclesDone = Math.floor(elapsed / length);
  const day = (elapsed % length) + 1;
  const phase = cyclePhase(day, length);
  const dueSoon = length - day < PERIOD_PROMPT_WINDOW_DAYS;
  const overdueUnconfirmed = cyclesDone > 0 && day <= PERIOD_PROMPT_WINDOW_DAYS;
  return {
    day,
    length,
    phase,
    phaseStartsToday: day === 1 || day === ovulationDay(length) + 1,
    periodExpected: dueSoon || overdueUnconfirmed,
    nextPeriod: new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + (cyclesDone + 1) * length,
    ),
  };
}

export function toLocalDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
