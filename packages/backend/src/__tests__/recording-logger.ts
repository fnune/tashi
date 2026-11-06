import type { Clock, StartTimer } from "../domain/clock.js";
import {
  type Logger,
  type LogRecord,
  silentLogger,
  structuredLogger,
} from "../domain/logger.js";

export function recordingLogger(): { logger: Logger; records: LogRecord[] } {
  const records: LogRecord[] = [];
  return {
    logger: structuredLogger((record) => records.push(record)),
    records,
  };
}

export const neverElapses: StartTimer = () => () => {};

export function quietObserver(clock: Clock = () => new Date(0)): {
  logger: Logger;
  clock: Clock;
  startTimer: StartTimer;
} {
  return { logger: silentLogger, clock, startTimer: neverElapses };
}
