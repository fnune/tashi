import type { Clock, StartTimer } from "../../domain/clock.js";
import type { Logger } from "../../domain/logger.js";

export const SLOW_QUERY_MS = 500;
export const QUERY_DEADLINE_MS = 10_000;

export interface QueryObserver {
  logger: Logger;
  clock: Clock;
  startTimer: StartTimer;
}

export class D1QueryError extends Error {
  constructor(sql: string, cause: unknown) {
    super(`D1 query failed: ${loggableSql(sql)}`, { cause });
    this.name = "D1QueryError";
  }
}

export class D1QueryTimeoutError extends Error {
  constructor(sql: string) {
    super(
      `D1 did not answer within ${QUERY_DEADLINE_MS} ms: ${loggableSql(sql)}`,
    );
    this.name = "D1QueryTimeoutError";
  }
}

export async function timedQuery<T>(
  { logger, clock, startTimer }: QueryObserver,
  sql: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = clock().getTime();
  let stopTimer = () => {};
  const timedOut = new Promise<never>((_, reject) => {
    stopTimer = startTimer(QUERY_DEADLINE_MS, () => {
      logger.error("d1_query_timed_out", {
        sql: loggableSql(sql),
        deadline_ms: QUERY_DEADLINE_MS,
      });
      reject(new D1QueryTimeoutError(sql));
    });
  });
  try {
    return await Promise.race([run(), timedOut]);
  } catch (error) {
    if (error instanceof D1QueryTimeoutError) throw error;
    throw new D1QueryError(sql, error);
  } finally {
    stopTimer();
    const durationMs = clock().getTime() - startedAt;
    if (durationMs >= SLOW_QUERY_MS && durationMs < QUERY_DEADLINE_MS) {
      logger.warn("d1_query_slow", {
        sql: loggableSql(sql),
        duration_ms: durationMs,
      });
    }
  }
}

function loggableSql(sql: string): string {
  return sql.length > 120 ? `${sql.slice(0, 120)}…` : sql;
}
