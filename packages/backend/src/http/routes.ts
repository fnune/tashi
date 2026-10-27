import { Hono } from "hono";
import type { ApiKeyStore } from "../domain/api-key-store.js";
import type { Doses } from "../domain/doses.js";
import { DomainError } from "../domain/errors.js";
import type { Repositories } from "../domain/repositories.js";
import type { TimelineService } from "../domain/timeline-service.js";
import {
  apiKeySchema,
  calculateSchema,
  createTimelineSchema,
  logMealSchema,
  settingsSchema,
  updateTimelineSchema,
} from "../schemas.js";
import { apiError } from "./api-error.js";

const TIME_ZONE_HEADER = "X-Timezone";

export interface RouteDependencies {
  doses: Doses;
  timeline: TimelineService;
  repositories: Repositories;
  apiKeys: ApiKeyStore;
}

export function createRoutes({
  doses,
  timeline,
  repositories,
  apiKeys,
}: RouteDependencies): Hono {
  const api = new Hono();

  api.onError((error, c) => {
    if (error instanceof DomainError) {
      const status = error.code === "not_found" ? 404 : 400;
      return apiError(c, error.code, status);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return apiError(c, "internal_error", 500, message);
  });

  api.post("/api/calculate", async (c) => {
    const parsed = calculateSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    return c.json(
      await doses.calculate(parsed.data, c.req.header(TIME_ZONE_HEADER)),
    );
  });

  api.get("/api/api-key", async (c) => c.json(await apiKeys.status()));

  api.put("/api/api-key", async (c) => {
    const parsed = apiKeySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await apiKeys.save(parsed.data.api_key);
    return c.json(await apiKeys.status());
  });

  api.delete("/api/api-key", async (c) => {
    await apiKeys.clear();
    return c.json(await apiKeys.status());
  });

  api.post("/api/meals", async (c) => {
    const parsed = logMealSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    return c.json(await timeline.logMeal(parsed.data));
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

  api.get("/api/timeline", async (c) =>
    c.json(await repositories.timeline.list()),
  );

  api.get("/api/iob", async (c) => c.json(await doses.insulinOnBoard()));

  api.post("/api/timeline", async (c) => {
    const parsed = createTimelineSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    return c.json(await timeline.addEntry(parsed.data), 201);
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
