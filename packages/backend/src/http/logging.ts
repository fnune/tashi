import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Clock } from "../domain/clock.js";
import {
  CalculationFailedError,
  type CalculationFailure,
  DomainError,
} from "../domain/errors.js";
import { errorFields, type Logger } from "../domain/logger.js";
import type { ProblemLog } from "../domain/problems.js";
import { apiError } from "./api-error.js";

export function logRequests(logger: Logger, clock: Clock): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = clock().getTime();
    await next();
    const durationMs = clock().getTime() - startedAt;
    const { status } = c.res;
    logger[status >= 500 ? "error" : "info"]("request", {
      ...requestFields(c),
      status,
      duration_ms: durationMs,
    });
  };
}

const CALCULATION_FAILURE_STATUS: Record<CalculationFailure, 422 | 500 | 503> =
  {
    calculation_unfinished: 500,
    ai_busy: 503,
    ai_unreachable: 503,
    ai_declined: 422,
  };

export function respondToErrors(
  logger: Logger,
  problems: ProblemLog,
): ErrorHandler {
  return async (error, c) => {
    const recordProblem = async (problem: unknown) => {
      try {
        await problems.record(requestFields(c), problem);
      } catch (recordingError) {
        logger.warn("problem_not_recorded", errorFields(recordingError));
      }
    };
    if (error instanceof HTTPException) {
      logger.info("request_refused", {
        ...requestFields(c),
        status: error.status,
      });
      return error.getResponse();
    }
    if (error instanceof CalculationFailedError) {
      logger.warn("calculation_failed", {
        ...requestFields(c),
        code: error.code,
        looked_up: error.lookedUp.join(" | "),
        ...errorFields(error),
      });
      await recordProblem(error);
      return apiError(
        c,
        error.code,
        CALCULATION_FAILURE_STATUS[error.code],
        undefined,
        error.lookedUp,
      );
    }
    if (error instanceof DomainError) {
      logger.info("request_refused", { ...requestFields(c), code: error.code });
      return apiError(c, error.code, error.code === "not_found" ? 404 : 400);
    }
    logger.error("request_failed", {
      ...requestFields(c),
      ...errorFields(error),
    });
    await recordProblem(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(c, "internal_error", 500, message);
  };
}

function requestFields(c: Context) {
  return { method: c.req.method, path: c.req.path };
}
