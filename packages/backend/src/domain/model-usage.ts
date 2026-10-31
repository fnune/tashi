import type { FoodVocabEntry, UsageSummary } from "@tashi/shared";
import type { Clock } from "./clock.js";
import type { FoodParser, ParseOutcome } from "./food-parser.js";
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

interface Price {
  model: string;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export const PRICES_CHECKED_ON = "2026-10-31";

// US dollars per million tokens, from platform.claude.com/docs/en/about-claude/pricing.
// Cache writes are the 5-minute kind; Haiku 5.5 is priced for prompts under
// 100,000 tokens, which a calculation never reaches.
const PRICES: Price[] = [
  {
    model: "claude-haiku-4-5",
    input: 1,
    cacheWrite: 1.25,
    cacheRead: 0.1,
    output: 5,
  },
  {
    model: "claude-haiku-5-5",
    input: 0.1,
    cacheWrite: 0.125,
    cacheRead: 0.01,
    output: 0.5,
  },
  {
    model: "claude-sonnet-4-6",
    input: 3,
    cacheWrite: 3.75,
    cacheRead: 0.3,
    output: 15,
  },
  {
    model: "claude-sonnet-5",
    input: 2,
    cacheWrite: 2.5,
    cacheRead: 0.2,
    output: 10,
  },
  {
    model: "claude-sonnet-5-5",
    input: 2,
    cacheWrite: 2.5,
    cacheRead: 0.1,
    output: 10,
  },
  {
    model: "claude-opus-5-5",
    input: 4,
    cacheWrite: 5,
    cacheRead: 0.2,
    output: 20,
  },
];

function priceOf(model: string): Price | undefined {
  const undated = model.replace(/-\d{8}$/, "");
  return PRICES.find((price) => price.model === undated);
}

export function estimatedCostUsd(totals: ModelUsage[]): number | null {
  let cost = 0;
  for (const usage of totals) {
    const price = priceOf(usage.model);
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
  ): Promise<ParseOutcome> {
    const outcome = await this.inner.parse(
      foodDescription,
      vocabulary,
      language,
    );
    await this.usage.record(outcome.usage, this.clock());
    return outcome;
  }
}
