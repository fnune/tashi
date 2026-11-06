import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  D1QueryError,
  D1QueryTimeoutError,
  QUERY_DEADLINE_MS,
  timedQuery,
} from "../data/d1/timed-query.js";
import { setupTokenWithHash } from "../domain/auth/setup-token.js";
import { sha256, toHex } from "../domain/auth/tokens.js";
import type { StartTimer } from "../domain/clock.js";
import { DomainError } from "../domain/errors.js";
import { errorFields } from "../domain/logger.js";
import { logRequests, respondToErrors } from "../http/logging.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { neverElapses, recordingLogger } from "./recording-logger.js";
import { sequentialIds } from "./sequential-ids.js";
import { testBuild } from "./test-catalog.js";

function steppingClock(stepMs: number) {
  let now = 0;
  return () => {
    const time = new Date(now);
    now += stepMs;
    return time;
  };
}

function manualTimer(): { startTimer: StartTimer; elapse: () => void } {
  let pending: (() => void) | undefined;
  return {
    startTimer: (_ms, onElapsed) => {
      pending = onElapsed;
      return () => {
        pending = undefined;
      };
    },
    elapse: () => pending?.(),
  };
}

describe("D1 query timing", () => {
  it("fails a query D1 never answers once the deadline passes, and logs it", async () => {
    const { logger, records } = recordingLogger();
    const timer = manualTimer();
    const query = timedQuery(
      { logger, clock: steppingClock(0), startTimer: timer.startTimer },
      "SELECT failures FROM sign_in_failures WHERE name_key = ?",
      () => new Promise(() => {}),
    );
    timer.elapse();
    await expect(query).rejects.toBeInstanceOf(D1QueryTimeoutError);
    expect(records).toEqual([
      {
        level: "error",
        event: "d1_query_timed_out",
        sql: "SELECT failures FROM sign_in_failures WHERE name_key = ?",
        deadline_ms: QUERY_DEADLINE_MS,
      },
    ]);
  });

  it("warns about a slow query", async () => {
    const { logger, records } = recordingLogger();
    await timedQuery(
      { logger, clock: steppingClock(800), startTimer: neverElapses },
      "SELECT 1",
      async () => 1,
    );
    expect(records).toEqual([
      {
        level: "warn",
        event: "d1_query_slow",
        sql: "SELECT 1",
        duration_ms: 800,
      },
    ]);
  });

  it("names the statement that failed", async () => {
    const { logger } = recordingLogger();
    const query = timedQuery(
      { logger, clock: steppingClock(0), startTimer: neverElapses },
      "INSERT INTO accounts (id) VALUES (?)",
      async () => {
        throw new Error("D1_ERROR: UNIQUE constraint failed");
      },
    );
    await expect(query).rejects.toBeInstanceOf(D1QueryError);
    await expect(query).rejects.toThrow(
      "D1 query failed: INSERT INTO accounts (id) VALUES (?)",
    );
  });
});

describe("request logging", () => {
  function appWith(handler: () => Promise<Response>) {
    const { logger, records } = recordingLogger();
    const app = new Hono();
    app.onError(respondToErrors(logger));
    app.use("/api/*", logRequests(logger, steppingClock(25)));
    app.get("/api/thing", handler);
    return { app, records };
  }

  it("logs each API request with its status and duration", async () => {
    const { app, records } = appWith(async () => Response.json({ ok: true }));
    await app.request("/api/thing");
    expect(records).toEqual([
      {
        level: "info",
        event: "request",
        method: "GET",
        path: "/api/thing",
        status: 200,
        duration_ms: 25,
      },
    ]);
  });

  it("logs an unexpected error with its cause before answering 500", async () => {
    const { app, records } = appWith(async () => {
      throw new D1QueryError("SELECT 1", new Error("D1 is unavailable"));
    });
    const response = await app.request("/api/thing");
    expect(response.status).toBe(500);
    expect(records.map((record) => [record.level, record.event])).toEqual([
      ["error", "request_failed"],
      ["error", "request"],
    ]);
    expect(records[0]).toMatchObject({
      error: "D1QueryError",
      error_message: "D1 query failed: SELECT 1",
      error_cause: "Error: D1 is unavailable",
    });
  });

  it("logs a refused request by its code", async () => {
    const { app, records } = appWith(async () => {
      throw new DomainError("no_meal_window");
    });
    expect((await app.request("/api/thing")).status).toBe(400);
    expect(records[0]).toEqual({
      level: "info",
      event: "request_refused",
      method: "GET",
      path: "/api/thing",
      code: "no_meal_window",
    });
  });
});

describe("refusals Hono raises", () => {
  it("keep their own status", async () => {
    const { logger, records } = recordingLogger();
    const app = new Hono();
    app.onError(respondToErrors(logger));
    app.get("/api/thing", () => {
      throw new HTTPException(403, { message: "Forbidden" });
    });
    expect((await app.request("/api/thing")).status).toBe(403);
    expect(records[0]).toMatchObject({
      event: "request_refused",
      status: 403,
    });
  });
});

describe("authentication logging", () => {
  const ORIGIN = "https://tashi.example.workers.dev";
  const SETUP_TOKEN = "setup-token-from-the-build";

  it("logs sign-in outcomes without the name or the password", async () => {
    const { logger, records } = recordingLogger();
    const { app } = createApp({
      config: { basePath: "" },
      setupToken: setupTokenWithHash(
        toHex(await sha256(new TextEncoder().encode(SETUP_TOKEN))),
      ),
      repositories: createInMemoryRepositories(),
      foodCatalog: new InMemoryFoodCatalog(testBuild.records),
      fetch: async () => new Response(null, { status: 500 }),
      clock: () => new Date("2026-06-13T12:00:00.000Z"),
      newId: sequentialIds(),
      logger,
    });
    const opened = await app.request(`${ORIGIN}/setup?token=${SETUP_TOKEN}`);
    const setupCookie = opened.headers.getSetCookie()[0]?.split(";")[0] ?? "";
    const post = (path: string, body: object, cookie = "") =>
      app.request(`${ORIGIN}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          Cookie: cookie,
        },
        body: JSON.stringify(body),
      });
    await post(
      "/api/setup",
      { name: "Ana", password: "correct horse battery" },
      setupCookie,
    );
    await post("/api/auth/sign-in", { name: "Ana", password: "wrong one" });
    await post("/api/auth/sign-in", {
      name: "Ana",
      password: "correct horse battery",
    });

    expect(
      records
        .filter((record) => record.event !== "request")
        .map((record) => record.event),
    ).toEqual(["set_up", "sign_in_failed", "signed_in"]);
    const logged = JSON.stringify(records);
    expect(logged).not.toContain("Ana");
    expect(logged).not.toContain("wrong one");
    expect(logged).not.toContain("correct horse");
  });
});

describe("errorFields", () => {
  it("describes a value thrown that is not an Error", () => {
    expect(errorFields("D1 went away")).toEqual({ error: "D1 went away" });
  });
});
