import type { ProblemsResponse } from "@tashi/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { Calculator } from "../domain/calculator.js";
import { DiaryImport } from "../domain/diary-import.js";
import { InsulinUnits } from "../domain/insulin-units.js";
import { silentLogger } from "../domain/logger.js";
import {
  MAX_PROBLEM_TEXT,
  PROBLEMS_KEPT,
  ProblemLog,
} from "../domain/problems.js";
import type { Repositories } from "../domain/repositories.js";
import { TimelineService } from "../domain/timeline-service.js";
import { createRoutes } from "../http/routes.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { recordingLogger } from "./recording-logger.js";
import { sequentialIds } from "./sequential-ids.js";
import { signedIn, TEST_DATA_KEY, testAiConnections } from "./signed-in.js";
import { testBuild } from "./test-catalog.js";

const NOW = new Date("2026-11-06T20:00:00.000Z");

describe("problems", () => {
  let repositories: Repositories;

  beforeEach(() => {
    repositories = createInMemoryRepositories();
  });

  function app(role: "admin" | "member" = "admin", logger = silentLogger) {
    const clock = () => NOW;
    const newId = sequentialIds();
    return signedIn(
      createRoutes({
        insulinUnits: new InsulinUnits(
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
        logger,
        problems: new ProblemLog(repositories.problems, clock),
      }),
      TEST_DATA_KEY,
      role,
    );
  }

  function failingSettings(error: unknown) {
    repositories.settings.get = async () => {
      throw error;
    };
  }

  it("records an unexpected error and lists it for the admin", async () => {
    failingSettings(
      new Error("D1 query failed: SELECT * FROM settings", {
        cause: new Error("D1 is unavailable"),
      }),
    );
    expect((await app().request("/api/settings")).status).toBe(500);

    const response = await app().request("/api/problems");
    const body: ProblemsResponse = await response.json();
    expect(body.problems).toEqual([
      {
        occurred_at: NOW.toISOString(),
        method: "GET",
        path: "/api/settings",
        error: "Error",
        message: "D1 query failed: SELECT * FROM settings",
        cause: "Error: D1 is unavailable",
      },
    ]);
  });

  it("keeps a member out of the list", async () => {
    expect((await app("member").request("/api/problems")).status).toBe(404);
  });

  it("clips a long message so one error cannot fill the table", async () => {
    failingSettings(new Error("x".repeat(MAX_PROBLEM_TEXT * 3)));
    await app().request("/api/settings");
    const [problem] = await repositories.problems.recent();
    expect(problem?.message).toHaveLength(MAX_PROBLEM_TEXT);
  });

  it("keeps the newest problems only", async () => {
    failingSettings(new Error("D1 is unavailable"));
    for (let i = 0; i < PROBLEMS_KEPT + 3; i++) {
      await app().request("/api/settings");
    }
    expect(await repositories.problems.recent()).toHaveLength(PROBLEMS_KEPT);
  });

  it("still answers 500 and logs a warning when the problem cannot be recorded", async () => {
    failingSettings(new Error("D1 is unavailable"));
    repositories.problems.record = async () => {
      throw new Error("D1 is still unavailable");
    };
    const { logger, records } = recordingLogger();
    expect((await app("admin", logger).request("/api/settings")).status).toBe(
      500,
    );
    expect(records.map((record) => record.event)).toContain(
      "problem_not_recorded",
    );
  });
});
