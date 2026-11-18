import type { FoodVocabEntry, UsageSummary } from "@tashi/shared";
import type { AiConnection } from "./ai-connections.js";
import type { Clock } from "./clock.js";
import { CalculationFailedError } from "./errors.js";
import type { FoodParser, ParseOutcome } from "./food-parser.js";
import { modelOf, PRICES_CHECKED_ON } from "./models.js";
import type { ModelUsageRepository } from "./repositories.js";

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface ModelUsageTotal extends ModelUsage {
  calculations: number;
}

export function estimatedCostUsd(totals: ModelUsage[]): number | null {
  let cost = 0;
  for (const usage of totals) {
    const price = modelOf(usage.model)?.prices;
    if (!price) return null;
    cost +=
      (usage.inputTokens * price.input +
        usage.cacheWriteTokens * price.cacheWrite +
        usage.cacheReadTokens * price.cacheRead +
        usage.outputTokens * price.output) /
      1_000_000;
  }
  return cost;
}

export async function usageSince(
  repository: ModelUsageRepository,
  since: Date,
): Promise<UsageSummary> {
  const totals = await repository.totalsSince(since);
  return {
    calculations: totals.reduce((sum, t) => sum + t.calculations, 0),
    estimated_cost_usd: estimatedCostUsd(totals),
    prices_checked_on: PRICES_CHECKED_ON,
  };
}

export class MeteredFoodParser implements FoodParser {
  constructor(
    private inner: FoodParser,
    private usage: ModelUsageRepository,
    private clock: Clock,
  ) {}

  async parse(
    foodDescription: string,
    vocabulary: FoodVocabEntry[],
    language: "en" | "es",
    connection: AiConnection | null,
  ): Promise<ParseOutcome> {
    let outcome: ParseOutcome;
    try {
      outcome = await this.inner.parse(
        foodDescription,
        vocabulary,
        language,
        connection,
      );
    } catch (e) {
      if (e instanceof CalculationFailedError && e.usage) {
        await this.usage.record(e.usage, this.clock());
      }
      throw e;
    }
    await this.usage.record(outcome.usage, this.clock());
    return outcome;
  }
}
