import type { ModelUsage, ModelUsageTotal } from "../../domain/model-usage.js";
import type { ModelUsageRepository } from "../../domain/repositories.js";
import type { Db } from "../database.js";
import { instantOf } from "./columns.js";

export class SqliteModelUsageRepository implements ModelUsageRepository {
  constructor(private db: Db) {}

  async record(usage: ModelUsage, at: Date): Promise<void> {
    await this.db
      .insertInto("model_usage")
      .values({
        used_at: instantOf(at),
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        cache_write_tokens: usage.cacheWriteTokens,
        cache_read_tokens: usage.cacheReadTokens,
      })
      .execute();
  }

  async totalsSince(since: Date): Promise<ModelUsageTotal[]> {
    const rows = await this.db
      .selectFrom("model_usage")
      .select((eb) => [
        "model",
        eb.fn.countAll<number>().as("calculations"),
        eb.fn.sum<number>("input_tokens").as("input_tokens"),
        eb.fn.sum<number>("output_tokens").as("output_tokens"),
        eb.fn.sum<number>("cache_write_tokens").as("cache_write_tokens"),
        eb.fn.sum<number>("cache_read_tokens").as("cache_read_tokens"),
      ])
      .where("used_at", ">=", instantOf(since))
      .groupBy("model")
      .orderBy("model")
      .execute();
    return rows.map((row) => ({
      model: row.model,
      calculations: Number(row.calculations),
      inputTokens: Number(row.input_tokens),
      outputTokens: Number(row.output_tokens),
      cacheWriteTokens: Number(row.cache_write_tokens),
      cacheReadTokens: Number(row.cache_read_tokens),
    }));
  }
}
