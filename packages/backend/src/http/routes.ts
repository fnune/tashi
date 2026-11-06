import type { ProblemsResponse, TimelinePageResponse } from "@tashi/shared";
import { type Context, Hono } from "hono";
import type { AiConnections } from "../domain/ai-connections.js";
import type { DiaryImport } from "../domain/diary-import.js";
import type { Doses } from "../domain/doses.js";
import type { Logger } from "../domain/logger.js";
import { usageSince } from "../domain/model-usage.js";
import type { ProblemLog } from "../domain/problems.js";
import type { Repositories } from "../domain/repositories.js";
import {
  isoTimestampSchema,
  settingsSchema,
  timeZoneSchema,
} from "../domain/schemas.js";
import type { TimelineService } from "../domain/timeline-service.js";
import { apiError } from "./api-error.js";
import type { SignedIn } from "./authentication.js";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { respondToErrors } from "./logging.js";
import {
  calculateSchema,
  chooseAiModelSchema,
  connectAiSchema,
  createTimelineSchema,
  importEntriesSchema,
  logMealSchema,
  startImportSchema,
  updateTimelineSchema,
} from "./request-schemas.js";

const TIME_ZONE_HEADER = "X-Timezone";

export interface RouteDependencies {
  doses: Doses;
  timeline: TimelineService;
  diaryImport: DiaryImport;
  repositories: Repositories;
  aiConnections: AiConnections;
  defaultTimeZone: string;
  logger: Logger;
  problems: ProblemLog;
}

export function createRoutes({
  doses,
  timeline,
  diaryImport,
  repositories,
  aiConnections,
  defaultTimeZone,
  logger,
  problems,
}: RouteDependencies): Hono<SignedIn> {
  const api = new Hono<SignedIn>();
  const dataKeyOf = (c: Context<SignedIn>) => c.get("session").dataKey;

  function timeZoneOf(header: string | undefined): string {
    const parsed = timeZoneSchema.safeParse(header);
    return parsed.success ? parsed.data : defaultTimeZone;
  }

  api.onError(respondToErrors(logger, problems));

  api.get("/api/problems", async (c) => {
    if (c.get("session").account.role !== "admin") {
      return apiError(c, "not_found", 404);
    }
    const body: ProblemsResponse = {
      problems: (await problems.recent()).map((problem) => ({
        occurred_at: problem.occurredAt.toISOString(),
        method: problem.method,
        path: problem.path,
        error: problem.error,
        message: problem.message,
        cause: problem.cause,
      })),
    };
    return c.json(body);
  });

  api.post("/api/calculate", async (c) => {
    const parsed = calculateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    return c.json(
      await doses.calculate(
        await aiConnections.get(dataKeyOf(c)),
        parsed.data,
        c.req.header(TIME_ZONE_HEADER),
      ),
    );
  });

  api.get("/api/ai-connection", async (c) =>
    c.json(await aiConnections.status(dataKeyOf(c))),
  );

  api.put("/api/ai-connection", async (c) => {
    const parsed = connectAiSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await aiConnections.connect(
      dataKeyOf(c),
      parsed.data.api_key,
      parsed.data.model,
    );
    return c.json(await aiConnections.status(dataKeyOf(c)));
  });

  api.put("/api/ai-connection/model", async (c) => {
    const parsed = chooseAiModelSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await aiConnections.chooseModel(parsed.data.model);
    return c.json(await aiConnections.status(dataKeyOf(c)));
  });

  api.get("/api/usage", async (c) => {
    const since = isoTimestampSchema.safeParse(c.req.query("since"));
    if (!since.success) {
      return apiError(c, "validation_failed", 400, since.error.message);
    }
    return c.json(
      await usageSince(repositories.modelUsage, new Date(since.data)),
    );
  });

  api.delete("/api/ai-connection", async (c) => {
    await aiConnections.disconnect();
    return c.json(await aiConnections.status(dataKeyOf(c)));
  });

  api.post("/api/meals", async (c) => {
    const parsed = logMealSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    return c.json(
      await timeline.logMeal(
        parsed.data,
        timeZoneOf(c.req.header(TIME_ZONE_HEADER)),
      ),
    );
  });

  api.get("/api/settings", async (c) =>
    c.json(await repositories.settings.get()),
  );

  api.put("/api/settings", async (c) => {
    const parsed = settingsSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await repositories.settings.save(parsed.data);
    return c.json(parsed.data);
  });

  api.get("/api/timeline", async (c) => {
    const limit = Math.min(
      Math.max(Number.parseInt(c.req.query("limit") ?? "", 10) || 100, 1),
      500,
    );
    const cursorText = c.req.query("cursor");
    const before = cursorText ? decodeCursor(cursorText) : undefined;
    if (before === null) {
      return apiError(c, "validation_failed", 400, "Invalid cursor.");
    }
    const page = await repositories.timeline.page({ before, limit });
    const response: TimelinePageResponse = {
      entries: page.entries,
      next_cursor: page.next ? encodeCursor(page.next) : null,
    };
    return c.json(response);
  });

  api.get("/api/vocabulary", async (c) =>
    c.json(await repositories.vocabulary.list()),
  );

  api.post("/api/import", async (c) => {
    const parsed = startImportSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await diaryImport.start(parsed.data.settings, parsed.data.vocabulary);
    return c.json({ ok: true });
  });

  api.post("/api/import/entries", async (c) => {
    const parsed = importEntriesSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await diaryImport.addEntries(parsed.data.entries);
    return c.json({ ok: true });
  });

  api.get("/api/iob", async (c) => c.json(await doses.insulinOnBoard()));

  api.post("/api/timeline", async (c) => {
    const parsed = createTimelineSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    return c.json(
      await timeline.addEntry(
        parsed.data,
        timeZoneOf(c.req.header(TIME_ZONE_HEADER)),
      ),
      201,
    );
  });

  api.put("/api/timeline/:id", async (c) => {
    const parsed = updateTimelineSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    return c.json(await timeline.updateEntry(c.req.param("id"), parsed.data));
  });

  api.delete("/api/timeline/:id", async (c) => {
    await timeline.deleteEntry(c.req.param("id"));
    return c.json({ ok: true });
  });

  api.delete("/api/timeline", async (c) => {
    await timeline.clear();
    return c.json({ ok: true });
  });

  return api;
}
