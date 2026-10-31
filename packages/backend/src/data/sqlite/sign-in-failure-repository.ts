import type {
  SignInFailureRepository,
  SignInFailures,
} from "../../domain/repositories.js";
import type { Db } from "../database.js";
import { instantOf } from "./columns.js";

export class SqliteSignInFailureRepository implements SignInFailureRepository {
  constructor(private db: Db) {}

  async get(nameKey: string): Promise<SignInFailures | null> {
    const row = await this.db
      .selectFrom("sign_in_failures")
      .select(["failures", "last_failure_at"])
      .where("name_key", "=", nameKey)
      .executeTakeFirst();
    return row
      ? { failures: row.failures, lastFailureAt: new Date(row.last_failure_at) }
      : null;
  }

  async record(nameKey: string, at: Date): Promise<void> {
    await this.db
      .insertInto("sign_in_failures")
      .values({
        name_key: nameKey,
        failures: 1,
        last_failure_at: instantOf(at),
      })
      .onConflict((oc) =>
        oc.column("name_key").doUpdateSet((eb) => ({
          failures: eb("sign_in_failures.failures", "+", 1),
          last_failure_at: eb.ref("excluded.last_failure_at"),
        })),
      )
      .execute();
  }

  async clear(nameKey: string): Promise<void> {
    await this.db
      .deleteFrom("sign_in_failures")
      .where("name_key", "=", nameKey)
      .execute();
  }
}
