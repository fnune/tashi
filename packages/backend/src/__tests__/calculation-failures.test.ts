import { DEFAULT_SETTINGS, type ErrorResponse } from "@tashi/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { AnthropicFoodParser } from "../data/anthropic-food-parser.js";
import { Calculator } from "../domain/calculator.js";
import { systemClock } from "../domain/clock.js";
import { DiaryImport } from "../domain/diary-import.js";
import { InsulinUnits } from "../domain/insulin-units.js";
import { KeyedFoodParser } from "../domain/keyed-food-parser.js";
import { silentLogger } from "../domain/logger.js";
import { MeteredFoodParser } from "../domain/model-usage.js";
import { ProblemLog } from "../domain/problems.js";
import type { Repositories } from "../domain/repositories.js";
import { TimelineService } from "../domain/timeline-service.js";
import { createRoutes } from "../http/routes.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { sequentialIds } from "./sequential-ids.js";
import { signedIn, TEST_DATA_KEY, testAiConnections } from "./signed-in.js";
import { testBuild } from "./test-catalog.js";

type Reply = () => Response | Promise<Response>;

const usage = { input_tokens: 1000, output_tokens: 500 };

function message(content: unknown[], stopReason: string, extra = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
    ...extra,
  };
}

const searchFor =
  (query: string): Reply =>
  () =>
    Response.json(
      message(
        [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "search_foods",
            input: { query },
          },
        ],
        "tool_use",
      ),
    );

const stoppedWith =
  (stopReason: string, extra = {}): Reply =>
  () =>
    Response.json(message([], stopReason, extra));

const streamedStop =
  (stopReason: string): Reply =>
  () => {
    const events = [
      ["message_start", { type: "message_start", message: message([], "") }],
      [
        "message_delta",
        {
          type: "message_delta",
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: 500 },
        },
      ],
      ["message_stop", { type: "message_stop" }],
    ] as const;
    const body = events
      .map(
        ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      )
      .join("");
    return new Response(body, {
      headers: { "Content-Type": "text/event-stream" },
    });
  };

const answeredWith =
  (status: number): Reply =>
  () =>
    Response.json(
      {
        type: "error",
        error: { type: "overloaded_error", message: "Overloaded" },
      },
      { status, headers: { "retry-after-ms": "0" } },
    );

function scripted(replies: Reply[]): typeof fetch {
  let next = 0;
  return async () => {
    const reply = replies[Math.min(next, replies.length - 1)];
    next += 1;
    if (!reply) throw new Error("No scripted reply");
    return reply();
  };
}

describe("a calculation the model does not finish", () => {
  let repositories: Repositories;

  beforeEach(async () => {
    repositories = createInMemoryRepositories();
    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      meal_windows: [
        { name: "all-day", start_hour: 0, end_hour: 24, ratio: 10 },
      ],
      bolus_insulin_id: "novorapid",
    });
  });

  async function calculateWith(model: typeof fetch) {
    const foodCatalog = new InMemoryFoodCatalog(testBuild.records);
    const aiConnections = testAiConnections(repositories);
    await aiConnections.connect(TEST_DATA_KEY, "sk-ant-test");
    const newId = sequentialIds();
    const parser = new MeteredFoodParser(
      new KeyedFoodParser(new AnthropicFoodParser(foodCatalog, model)),
      repositories.modelUsage,
      systemClock,
    );
    const app = signedIn(
      createRoutes({
        insulinUnits: new InsulinUnits(
          repositories,
          new Calculator(parser, foodCatalog, systemClock, newId),
          systemClock,
        ),
        timeline: new TimelineService(repositories, systemClock, newId),
        diaryImport: new DiaryImport(repositories),
        repositories,
        aiConnections,
        defaultTimeZone: "Europe/Berlin",
        logger: silentLogger,
        problems: new ProblemLog(repositories.problems, systemClock),
      }),
      TEST_DATA_KEY,
    );
    const res = await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "rice and seeded rye bread" }),
    });
    return { status: res.status, body: (await res.json()) as ErrorResponse };
  }

  it("asks again with room for a longer answer before giving up", async () => {
    const { status, body } = await calculateWith(
      scripted([
        searchFor("rice white cooked"),
        searchFor("bread rye seeded"),
        searchFor("bread rye seeded"),
        stoppedWith("max_tokens"),
        streamedStop("max_tokens"),
      ]),
    );
    expect(status).toBe(500);
    expect(body).toMatchObject({
      code: "calculation_unfinished",
      looked_up: ["rice white cooked", "bread rye seeded"],
    });
  });

  it("counts the tokens a failed calculation spent", async () => {
    await calculateWith(
      scripted([stoppedWith("max_tokens"), streamedStop("max_tokens")]),
    );
    const [total] = await repositories.modelUsage.totalsSince(new Date(0));
    expect(total).toMatchObject({ inputTokens: 2000, outputTokens: 1000 });
  });

  it("is recorded as a problem with what the model had looked up", async () => {
    await calculateWith(
      scripted([
        searchFor("bread rye seeded"),
        stoppedWith("max_tokens"),
        streamedStop("max_tokens"),
      ]),
    );
    const [problem] = await repositories.problems.recent();
    expect(problem?.error).toBe("CalculationFailedError");
  });

  it("does not ask the person to rephrase when the model ends without text", async () => {
    const { body } = await calculateWith(scripted([stoppedWith("end_turn")]));
    expect(body.code).toBe("calculation_unfinished");
  });

  it("says the model declined, with the category it gave", async () => {
    const { status, body } = await calculateWith(
      scripted([
        stoppedWith("refusal", {
          stop_details: { type: "refusal", category: "bio", explanation: "" },
        }),
      ]),
    );
    expect(status).toBe(422);
    expect(body.code).toBe("ai_declined");
    const [problem] = await repositories.problems.recent();
    expect(problem?.message).toContain("bio");
  });

  it("says Anthropic is busy when it stays overloaded after retrying", async () => {
    const { status, body } = await calculateWith(scripted([answeredWith(529)]));
    expect(status).toBe(503);
    expect(body.code).toBe("ai_busy");
  });

  it("says Anthropic is busy when it keeps rate limiting", async () => {
    const { body } = await calculateWith(scripted([answeredWith(429)]));
    expect(body.code).toBe("ai_busy");
  });

  it("says Anthropic could not be reached when the network fails", async () => {
    const { status, body } = await calculateWith(async () => {
      throw new TypeError("fetch failed");
    });
    expect(status).toBe(503);
    expect(body.code).toBe("ai_unreachable");
  });
});
