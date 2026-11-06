import type { Clock } from "./clock.js";
import { describeError } from "./logger.js";
import type { ProblemRepository } from "./repositories.js";

export const PROBLEMS_KEPT = 50;
export const MAX_PROBLEM_TEXT = 500;

export interface Problem {
  occurredAt: Date;
  method: string;
  path: string;
  error: string;
  message: string;
  cause: string | null;
}

export class ProblemLog {
  constructor(
    private problems: ProblemRepository,
    private clock: Clock,
  ) {}

  async record(
    request: { method: string; path: string },
    error: unknown,
  ): Promise<void> {
    const { error: name, message, cause } = describeError(error);
    await this.problems.record(
      {
        occurredAt: this.clock(),
        method: request.method,
        path: clipped(request.path),
        error: clipped(name),
        message: clipped(message),
        cause: cause === null ? null : clipped(cause),
      },
      PROBLEMS_KEPT,
    );
  }

  recent(): Promise<Problem[]> {
    return this.problems.recent();
  }
}

function clipped(text: string): string {
  return text.length > MAX_PROBLEM_TEXT
    ? `${text.slice(0, MAX_PROBLEM_TEXT - 1)}…`
    : text;
}
