import type { Problem } from "../../domain/problems.js";
import type { ProblemRepository } from "../../domain/repositories.js";
import type { Db } from "../database.js";
import type { WriteBatch } from "../write-batch.js";
import { instantOf } from "./columns.js";

export class SqliteProblemRepository implements ProblemRepository {
  constructor(
    private db: Db,
    private batch: WriteBatch,
  ) {}

  async record(problem: Problem, keep: number): Promise<void> {
    await this.batch.write([
      this.db.insertInto("problems").values({
        occurred_at: instantOf(problem.occurredAt),
        method: problem.method,
        path: problem.path,
        error: problem.error,
        message: problem.message,
        cause: problem.cause,
      }),
      this.db
        .deleteFrom("problems")
        .where("id", "not in", (eb) =>
          eb
            .selectFrom("problems")
            .select("id")
            .orderBy("id", "desc")
            .limit(keep),
        ),
    ]);
  }

  async recent(): Promise<Problem[]> {
    const rows = await this.db
      .selectFrom("problems")
      .selectAll()
      .orderBy("id", "desc")
      .execute();
    return rows.map((row) => ({
      occurredAt: new Date(row.occurred_at),
      method: row.method,
      path: row.path,
      error: row.error,
      message: row.message,
      cause: row.cause,
    }));
  }
}
