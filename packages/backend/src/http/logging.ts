import type { ErrorResponse } from "@tashi/shared";
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
import { type ErrorStatus, errorBody } from "./api-error.js";

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

export interface Failure {
  status: ErrorStatus;
  body: ErrorResponse;
}

export function describeFailures(logger: Logger, problems: ProblemLog) {
  return async (error: unknown, c: Context): Promise<Failure> => {
    const recordProblem = async (problem: unknown) => {
      try {
        await problems.record(requestFields(c), problem);
      } catch (recordingError) {
        logger.warn("problem_not_recorded", errorFields(recordingError));
      }
    };
    if (error instanceof CalculationFailedError) {
      logger.warn("calculation_failed", {
        ...requestFields(c),
        code: error.code,
        looked_up: error.lookedUp.join(" | "),
        ...errorFields(error),
      });
      await recordProblem(error);
      return {
        status: CALCULATION_FAILURE_STATUS[error.code],
        body: errorBody(error.code, undefined, error.lookedUp),
      };
    }
    if (error instanceof DomainError) {
      logger.info("request_refused", { ...requestFields(c), code: error.code });
      return {
        status: error.code === "not_found" ? 404 : 400,
        body: errorBody(error.code),
      };
    }
    logger.error("request_failed", {
      ...requestFields(c),
      ...errorFields(error),
    });
    await recordProblem(error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { status: 500, body: errorBody("internal_error", message) };
  };
}

export function respondToErrors(
  logger: Logger,
  problems: ProblemLog,
): ErrorHandler {
  const describe = describeFailures(logger, problems);
  return async (error, c) => {
    if (error instanceof HTTPException) {
      logger.info("request_refused", {
        ...requestFields(c),
        status: error.status,
      });
      return error.getResponse();
    }
    const { status, body } = await describe(error, c);
    return c.json(body, status);
  };
}

function requestFields(c: Context) {
  return { method: c.req.method, path: c.req.path };
}
