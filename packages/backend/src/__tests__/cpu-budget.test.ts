import { join } from "node:path";
import { DEFAULT_SETTINGS, type ParsedFoodItem } from "@tashi/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { AnthropicFoodParser } from "../data/anthropic-food-parser.js";
import { readCatalogFile } from "../data/catalog-file.js";
import { catalogAssets } from "../data/static-catalog/build.js";
import { searchIndexPath } from "../data/static-catalog/layout.js";
import { SearchIndex } from "../data/static-catalog/search-index.js";
import { StaticFoodCatalog } from "../data/static-catalog/static-food-catalog.js";
import { Calculator } from "../domain/calculator.js";
import type { Clock } from "../domain/clock.js";
import { DiaryImport } from "../domain/diary-import.js";
import { Doses } from "../domain/doses.js";
import { silentLogger } from "../domain/logger.js";
import { TimelineService } from "../domain/timeline-service.js";
import { createRoutes } from "../http/routes.js";
import { fullMeal, glucose, simpleMeal } from "./entries.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { sequentialIds } from "./sequential-ids.js";
import { signedIn, TEST_DATA_KEY, testAiConnections } from "./signed-in.js";

const WORKERS_FREE_CPU_MS = 10;
const BUDGET_MS = WORKERS_FREE_CPU_MS / 2;
const RUNS = 9;

const MEAL =
  "grilled chicken breast with white rice, a banana and orange juice";
const SEARCHES = [
  "chicken breast grilled",
  "rice white cooked",
  "banana raw",
  "orange juice",
];

let catalogFiles: Map<string, string>;
let searchIndex: SearchIndex;
let fdcIds: number[];

beforeAll(async () => {
  const build = await readCatalogFile(
    join(import.meta.dirname, "../../../../data/foods.db"),
  );
  catalogFiles = new Map(
    [...catalogAssets(build)].map(([path, content]) => [
      path,
      JSON.stringify(content),
    ]),
  );
  searchIndex = SearchIndex.parse(
    JSON.parse(catalogFiles.get(searchIndexPath) ?? "null"),
  );
  const catalog = coldCatalog();
  fdcIds = await Promise.all(
    SEARCHES.map(async (query) => {
      const [best] = await catalog.search(query, 1);
      if (!best) throw new Error(`No food for "${query}"`);
      return best.fdc_id;
    }),
  );
});

function coldCatalog(): StaticFoodCatalog {
  return new StaticFoodCatalog(searchIndex, async (path) => {
    const text = catalogFiles.get(path);
    return text === undefined ? null : JSON.parse(text);
  });
}

function modelReply(content: unknown[], stopReason: string): Response {
  return Response.json({
    id: "msg_budget",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5-20251001",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 2000, output_tokens: 400 },
  });
}

function scriptedModel(): typeof fetch {
  let round = 0;
  return async () => {
    round += 1;
    if (round === 1) {
      return modelReply(
        SEARCHES.map((query, i) => ({
          type: "tool_use",
          id: `toolu_${i}`,
          name: "search_foods",
          input: { query },
        })),
        "tool_use",
      );
    }
    const items: ParsedFoodItem[] = fdcIds.map((fdc_id, i) => ({
      description: SEARCHES[i] ?? "",
      fdc_id,
      weight_g: 150,
      assumed_cooked: true,
      confidence: "high",
      notes: null,
      estimated_net_carbs_per_100g: null,
      user_carbs: null,
      estimated_glycemic_index: null,
      estimated_fat_per_100g: null,
      estimated_protein_per_100g: null,
      warning: null,
    }));
    return modelReply(
      [{ type: "text", text: JSON.stringify({ status: "ok", items }) }],
      "end_turn",
    );
  };
}

async function coldApp() {
  const repositories = createInMemoryRepositories();
  await repositories.settings.save({
    ...DEFAULT_SETTINGS,
    bolus_insulin_id: "novorapid",
    basal_insulin_id: "tresiba",
  });
  const now = new Date("2026-06-13T10:30:00.000Z");
  const clock: Clock = () => now;
  const newId = sequentialIds();
  const catalog = coldCatalog();
  const parser = new AnthropicFoodParser(catalog, scriptedModel());
  const aiConnections = testAiConnections(repositories);
  await aiConnections.connect(TEST_DATA_KEY, "sk-ant-budget");
  const app = signedIn(
    createRoutes({
      doses: new Doses(
        repositories,
        new Calculator(parser, catalog, clock, newId),
        clock,
      ),
      timeline: new TimelineService(repositories, clock, newId),
      diaryImport: new DiaryImport(repositories),
      repositories,
      aiConnections,
      defaultTimeZone: "Europe/Berlin",
      logger: silentLogger,
    }),
  );
  return { app, repositories };
}

async function medianCpuMs(
  request: () => Promise<{ measure: () => Response | Promise<Response> }>,
): Promise<number> {
  const times: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const { measure } = await request();
    const start = process.cpuUsage();
    const response = await measure();
    const used = process.cpuUsage(start);
    expect(response.status, await response.clone().text()).toBe(200);
    times.push((used.user + used.system) / 1000);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(RUNS / 2)] ?? Number.POSITIVE_INFINITY;
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("CPU per request, with cold caches, stays within half the Workers Free limit", () => {
  it("calculates a meal of four foods with the model searching the catalog", async () => {
    const cpu = await medianCpuMs(async () => {
      const { app } = await coldApp();
      return {
        measure: () =>
          app.request("/api/calculate", json({ food_description: MEAL })),
      };
    });
    expect(cpu).toBeLessThan(BUDGET_MS);
  });

  it("pages through a long timeline", async () => {
    const cpu = await medianCpuMs(async () => {
      const { app, repositories } = await coldApp();
      await repositories.timeline.add(
        Array.from({ length: 300 }, (_, i) =>
          i % 3 === 0
            ? fullMeal(i + 1, -i * 60)
            : i % 3 === 1
              ? simpleMeal(i + 1, -i * 60)
              : glucose(i + 1, -i * 60),
        ),
      );
      return { measure: () => app.request("/api/timeline?limit=50") };
    });
    expect(cpu).toBeLessThan(BUDGET_MS);
  });

  it("saves the settings", async () => {
    const cpu = await medianCpuMs(async () => {
      const { app } = await coldApp();
      const settings = await (await app.request("/api/settings")).json();
      return {
        measure: () =>
          app.request("/api/settings", { ...json(settings), method: "PUT" }),
      };
    });
    expect(cpu).toBeLessThan(BUDGET_MS);
  });
});
