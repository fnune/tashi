import {
  DEFAULT_SETTINGS,
  type ParsedFoodItem,
  type UsageSummary,
} from "@tashi/shared";
import { describe, expect, it } from "vitest";
import { Calculator } from "../domain/calculator.js";
import { DiaryImport } from "../domain/diary-import.js";
import { Doses } from "../domain/doses.js";
import { silentLogger } from "../domain/logger.js";
import {
  estimatedCostUsd,
  MeteredFoodParser,
  type ModelUsage,
} from "../domain/model-usage.js";
import { PRICES_CHECKED_ON } from "../domain/models.js";
import { TimelineService } from "../domain/timeline-service.js";
import { createRoutes } from "../http/routes.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { sequentialIds } from "./sequential-ids.js";
import { signedIn, testAiConnections } from "./signed-in.js";
import { testBuild } from "./test-catalog.js";

function usage(model: string, overrides: Partial<ModelUsage> = {}) {
  return {
    model,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    ...overrides,
  };
}

describe("the estimated cost", () => {
  it("prices each kind of token at its model's price", () => {
    expect(
      estimatedCostUsd([
        usage("claude-haiku-4-5", {
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
          cacheWriteTokens: 1_000_000,
          cacheReadTokens: 1_000_000,
        }),
      ]),
    ).toBeCloseTo(1 + 5 + 1.25 + 0.1);
  });

  it("prices a dated snapshot as its model", () => {
    expect(
      estimatedCostUsd([
        usage("claude-haiku-4-5-20251001", { inputTokens: 1_000_000 }),
      ]),
    ).toBeCloseTo(1);
  });

  it("tells a model apart from a longer name that starts the same", () => {
    expect(
      estimatedCostUsd([usage("claude-sonnet-5-5", { cacheReadTokens: 1e6 })]),
    ).toBeCloseTo(0.1);
  });

  it("is unknown when any model has no known price", () => {
    expect(
      estimatedCostUsd([
        usage("claude-haiku-4-5", { inputTokens: 1000 }),
        usage("some-other-model", { inputTokens: 1000 }),
      ]),
    ).toBeNull();
  });
});

describe("GET /api/usage", () => {
  const rice: ParsedFoodItem = {
    description: "White rice (cooked)",
    fdc_id: null,
    weight_g: 100,
    assumed_cooked: true,
    confidence: "high",
    notes: null,
    estimated_net_carbs_per_100g: 28,
    user_carbs: null,
    estimated_glycemic_index: null,
    estimated_fat_per_100g: null,
    estimated_protein_per_100g: null,
    warning: null,
  };

  function app() {
    let now = new Date("2026-10-31T22:00:00.000Z");
    const repositories = createInMemoryRepositories();
    const parser = new FakeFoodParser("claude-haiku-4-5-20251001");
    parser.setResponse("rice", [rice]);
    parser.setClarification("something", "What is it?");
    const clock = () => now;
    const newId = sequentialIds();
    const calculator = new Calculator(
      new MeteredFoodParser(parser, repositories.modelUsage, clock),
      new InMemoryFoodCatalog(testBuild.records),
      clock,
      newId,
    );
    const routes = signedIn(
      createRoutes({
        doses: new Doses(repositories, calculator, clock),
        timeline: new TimelineService(repositories, clock, newId),
        diaryImport: new DiaryImport(repositories),
        repositories,
        aiConnections: testAiConnections(repositories),
        defaultTimeZone: "Europe/Berlin",
        logger: silentLogger,
      }),
    );
    return {
      repositories,
      calculate: (food_description: string) =>
        routes.request("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ food_description }),
        }),
      usageSince: async (since: string) =>
        (await (
          await routes.request(`/api/usage?since=${since}`)
        ).json()) as UsageSummary,
      advance: (ms: number) => {
        now = new Date(now.getTime() + ms);
      },
    };
  }

  it("counts every calculation since the start of the month, answered or not", async () => {
    const { repositories, calculate, usageSince, advance } = app();
    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      meal_windows: [
        { name: "all-day", start_hour: 0, end_hour: 24, ratio: 10 },
      ],
      bolus_insulin_id: "novorapid",
    });
    expect((await calculate("rice")).status).toBe(200);
    advance(3 * 60 * 60 * 1000);
    expect((await calculate("rice")).status).toBe(200);
    expect((await calculate("something")).status).toBe(200);

    expect(await usageSince("2026-10-31T23:00:00.000Z")).toEqual({
      calculations: 2,
      estimated_cost_usd: expect.closeTo((2 * (1000 * 1 + 200 * 5)) / 1e6, 9),
      prices_checked_on: PRICES_CHECKED_ON,
    });
  });

  it("asks when to count from", async () => {
    const { usageSince } = app();
    await expect(usageSince("yesterday")).resolves.toMatchObject({
      code: "validation_failed",
    });
  });
});
