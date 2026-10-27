import type {
  FastInsulinEntry,
  GlucoseEntry,
  LogMealResponse,
  SlowInsulinEntry,
  TimelineEntry,
} from "@tashi/shared";
import { findMealWindow, insulinOnBoard } from "@tashi/shared";
import { Hono } from "hono";
import type { ApiKeyStore } from "./api-key-store.js";
import type { Calculator } from "./calculator.js";
import type { Clock } from "./clock.js";
import {
  apiError,
  InvalidApiKeyError,
  MissingApiKeyError,
  SecretUnavailableError,
} from "./errors.js";
import type { IdGenerator } from "./ids.js";
import {
  apiKeySchema,
  calculateSchema,
  createTimelineSchema,
  logMealSchema,
  settingsSchema,
  updateTimelineSchema,
} from "./schemas.js";
import type { FileStorage } from "./storage.js";
import {
  applyTimelineUpdate,
  fastInsulinEntries,
  logMeal,
} from "./timeline.js";

const TIME_ZONE_HEADER = "X-Timezone";

export interface RouteDependencies {
  calculator: Calculator;
  storage: FileStorage;
  apiKeys: ApiKeyStore;
  clock: Clock;
  newId: IdGenerator;
}

export function createRoutes({
  calculator,
  storage,
  apiKeys,
  clock,
  newId,
}: RouteDependencies): Hono {
  const api = new Hono();

  api.post("/api/calculate", async (c) => {
    const body = await c.req.json();
    const parsed = calculateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }

    const timeZone = c.req.header(TIME_ZONE_HEADER);
    const settings = await storage.getSettings();
    const bolusInsulinId = settings.bolus_insulin_id;
    if (bolusInsulinId === null) {
      return apiError(c, "bolus_insulin_not_configured", 400);
    }
    if (
      !parsed.data.meal_window_override &&
      findMealWindow(settings, clock(), timeZone) === null
    ) {
      return apiError(c, "no_meal_window", 400);
    }
    const vocabulary = await storage.getVocabulary();

    try {
      const timeline = await storage.getTimeline();
      const iobUnits =
        settings.insulin_action_minutes === null
          ? 0
          : insulinOnBoard(fastInsulinEntries(timeline), settings, clock())
              .total_units;

      const outcome = await calculator.calculate(
        parsed.data.food_description,
        settings,
        parsed.data.current_blood_sugar,
        parsed.data.meal_window_override,
        vocabulary,
        iobUnits,
        timeZone,
      );

      if (outcome.status !== "ok") {
        return c.json({
          status: outcome.status,
          message: outcome.message,
        });
      }

      return c.json({ status: "ok" as const, result: outcome.result });
    } catch (e) {
      if (e instanceof MissingApiKeyError) {
        return apiError(c, "api_key_missing", 400);
      }
      if (e instanceof InvalidApiKeyError) {
        return apiError(c, "api_key_invalid", 400);
      }
      const message = e instanceof Error ? e.message : "Unknown error";
      return apiError(c, "internal_error", 500, message);
    }
  });

  api.get("/api/api-key", async (c) => c.json(await apiKeys.status()));

  api.put("/api/api-key", async (c) => {
    const parsed = apiKeySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    try {
      await apiKeys.save(parsed.data.api_key);
    } catch (e) {
      if (e instanceof SecretUnavailableError) {
        return apiError(c, "api_key_storage_unavailable", 400);
      }
      if (e instanceof InvalidApiKeyError) {
        return apiError(c, "api_key_invalid", 400);
      }
      throw e;
    }
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
    const settings = await storage.getSettings();
    const bolusInsulinId = settings.bolus_insulin_id;
    if (bolusInsulinId === null) {
      return apiError(c, "bolus_insulin_not_configured", 400);
    }

    const now = clock();
    const { meal, insulin } = logMeal(
      parsed.data.result,
      parsed.data.units,
      parsed.data.pre_bolus_minutes,
      bolusInsulinId,
      now,
      newId,
    );
    const entries: TimelineEntry[] = insulin ? [meal, insulin] : [meal];

    await storage.addTimelineEntries(entries);
    await storage.learnFromItems(parsed.data.result.items, now);

    const response: LogMealResponse = {
      meal_entry_id: meal.id,
      insulin_entry_id: insulin?.id ?? null,
    };
    return c.json(response);
  });

  api.get("/api/settings", async (c) => {
    const settings = await storage.getSettings();
    return c.json(settings);
  });

  api.put("/api/settings", async (c) => {
    const body = await c.req.json();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await storage.saveSettings(parsed.data);
    return c.json(parsed.data);
  });

  api.get("/api/timeline", async (c) => {
    const timeline = await storage.getTimeline();
    return c.json(timeline);
  });

  api.get("/api/iob", async (c) => {
    const settings = await storage.getSettings();
    if (settings.insulin_action_minutes === null) {
      return apiError(c, "insulin_action_not_configured", 400);
    }
    const timeline = await storage.getTimeline();
    try {
      return c.json(
        insulinOnBoard(fastInsulinEntries(timeline), settings, clock()),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return apiError(c, "internal_error", 500, message);
    }
  });

  api.post("/api/timeline", async (c) => {
    const body = await c.req.json();
    const parsed = createTimelineSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }

    const data = parsed.data;
    const id = newId();
    const timestamp = clock().toISOString();

    if (data.type === "fast_insulin") {
      const settings = await storage.getSettings();
      const bolusInsulinId = settings.bolus_insulin_id;
      if (bolusInsulinId === null) {
        return apiError(c, "bolus_insulin_not_configured", 400);
      }
      const entry: FastInsulinEntry = {
        id,
        timestamp,
        type: "fast_insulin",
        units: data.units,
        insulin_id: bolusInsulinId,
        related_meal_id: null,
      };
      await storage.addTimelineEntry(entry);
      return c.json(entry, 201);
    }

    if (data.type === "slow_insulin") {
      const settings = await storage.getSettings();
      const basalInsulinId = settings.basal_insulin_id;
      if (basalInsulinId === null) {
        return apiError(c, "basal_insulin_not_configured", 400);
      }
      const entry: SlowInsulinEntry = {
        id,
        timestamp,
        type: "slow_insulin",
        units: data.units,
        insulin_id: basalInsulinId,
      };
      await storage.addTimelineEntry(entry);
      return c.json(entry, 201);
    }

    const entry: GlucoseEntry = {
      id,
      timestamp,
      type: "glucose_reading",
      value: data.value,
      unit: data.unit,
    };
    await storage.addTimelineEntry(entry);
    return c.json(entry, 201);
  });

  api.put("/api/timeline/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = updateTimelineSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    const existing = (await storage.getTimeline()).find((e) => e.id === id);
    if (!existing) {
      return apiError(c, "not_found", 404);
    }
    const update = applyTimelineUpdate(existing, parsed.data);
    if (update.status === "type_mismatch") {
      return apiError(c, "not_found", 404);
    }
    if (update.status === "implausible_value") {
      return apiError(c, "validation_failed", 400);
    }
    await storage.replaceTimelineEntry(update.entry);
    return c.json(update.entry);
  });

  api.delete("/api/timeline/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await storage.deleteTimelineEntry(id);
    if (!deleted) {
      return apiError(c, "not_found", 404);
    }
    return c.json({ ok: true });
  });

  api.delete("/api/timeline", async (c) => {
    await storage.clearTimeline();
    return c.json({ ok: true });
  });

  return api;
}
