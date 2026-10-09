import type { CycleTracking } from "./types.js";

export type CyclePhase = "period" | "follicular" | "ovulation" | "luteal";

const PERIOD_DAYS = 5;
const LUTEAL_PHASE_DAYS = 14;
const DAY_MS = 86_400_000;

export const MIN_CYCLE_DAYS = 21;
export const MAX_CYCLE_DAYS = 45;

export interface CycleStatus {
  day: number;
  length: number;
  phase: CyclePhase;
  phaseStartsToday: boolean;
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
  return {
    day,
    length,
    phase,
    phaseStartsToday: day === 1 || day === ovulationDay(length) + 1,
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
