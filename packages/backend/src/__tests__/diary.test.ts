import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_SETTINGS,
  type Diary,
  type DiaryApi,
  exportDiary,
  importDiary,
  type TimelinePageResponse,
} from "@tashi/shared";
import { afterEach, describe, expect, it } from "vitest";
import { openSqliteRepositories } from "../data/sqlite/index.js";
import { Calculator } from "../domain/calculator.js";
import { DiaryImport } from "../domain/diary-import.js";
import { Doses } from "../domain/doses.js";
import { silentLogger } from "../domain/logger.js";
import { TimelineService } from "../domain/timeline-service.js";
import { createRoutes } from "../http/routes.js";
import {
  fastInsulin,
  fullMeal,
  glucose,
  simpleMeal,
  slowInsulin,
} from "./entries.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { sequentialIds } from "./sequential-ids.js";
import { signedIn, testAiConnections } from "./signed-in.js";
import { testBuild } from "./test-catalog.js";

const EXPORTED_AT = new Date("2026-06-14T00:00:00.000Z");
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function sqliteApp() {
  const directory = await mkdtemp(join(tmpdir(), "tashi-diary-"));
  const { repositories, close } = await openSqliteRepositories(
    join(directory, "tashi.sqlite"),
    { newId: sequentialIds(5000), catalogRelease: "test-release" },
  );
  cleanups.push(async () => {
    await close();
    await rm(directory, { recursive: true });
  });
  const clock = () => EXPORTED_AT;
  const newId = sequentialIds(9000);
  const app = signedIn(
    createRoutes({
      doses: new Doses(
        repositories,
        new Calculator(
          new FakeFoodParser(),
          new InMemoryFoodCatalog(testBuild.records),
          clock,
          newId,
        ),
        clock,
      ),
      timeline: new TimelineService(repositories, clock, newId),
      diaryImport: new DiaryImport(repositories),
      repositories,
      aiConnections: testAiConnections(repositories),
      defaultTimeZone: "Europe/Berlin",
      logger: silentLogger,
    }),
  );
  return { app, repositories };
}

function diaryApiOf(app: ReturnType<typeof signedIn>): DiaryApi {
  const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const response = await app.request(path, init);
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  };
  const post = (path: string, body: unknown) =>
    json<unknown>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(() => {});
  return {
    settings: () => json("/api/settings"),
    vocabulary: () => json("/api/vocabulary"),
    timelinePage: async (cursor) => {
      const page = await json<TimelinePageResponse>(
        `/api/timeline?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      );
      return { entries: page.entries, next: page.next_cursor };
    },
    startImport: (request) => post("/api/import", request),
    importEntries: (request) => post("/api/import/entries", request),
  };
}

async function filledDiary(): Promise<Diary> {
  const { app, repositories } = await sqliteApp();
  await repositories.settings.save({
    ...DEFAULT_SETTINGS,
    glucose_unit: "mmol/L",
    target_blood_sugar: 5.6,
    correction_factor: 2.2,
  });
  await repositories.timeline.add([
    fullMeal(1, 10),
    fastInsulin(2, 11, 1),
    simpleMeal(3, 40),
    glucose(4, 50),
    slowInsulin(5, 60),
  ]);
  await repositories.vocabulary.upsert([
    {
      description: "Rice",
      source: "usda_sr_legacy",
      fdc_id: 169756,
      catalog_name: "Rice, white, cooked",
      default_weight_g: 150,
      use_count: 3,
      last_used: "2026-06-13T12:00:00.000Z",
    },
  ]);
  return exportDiary(diaryApiOf(app), EXPORTED_AT);
}

describe("the diary file", () => {
  it("brings back the same diary when exported, imported elsewhere and exported again", async () => {
    const exported = await filledDiary();
    expect(exported.timeline).toHaveLength(5);

    const { app } = await sqliteApp();
    await importDiary(diaryApiOf(app), exported);

    expect(await exportDiary(diaryApiOf(app), EXPORTED_AT)).toEqual(exported);
  });

  it("replaces what was there before, instead of adding to it", async () => {
    const exported = await filledDiary();
    const { app, repositories } = await sqliteApp();
    await repositories.timeline.add([glucose(90, 5)]);

    await importDiary(diaryApiOf(app), exported);

    const ids = (await exportDiary(diaryApiOf(app), EXPORTED_AT)).timeline.map(
      (entry) => entry.id,
    );
    expect(ids).toEqual(exported.timeline.map((entry) => entry.id));
  });

  it("refuses an entry that is not in the shape the app writes", async () => {
    const { app } = await sqliteApp();
    const response = await app.request("/api/import/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: [{ id: "x", type: "meal" }] }),
    });
    expect(response.status).toBe(400);
  });
});
