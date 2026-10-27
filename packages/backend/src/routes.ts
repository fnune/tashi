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
import type { Repositories } from "./repositories.js";
import {
  apiKeySchema,
  calculateSchema,
  createTimelineSchema,
  logMealSchema,
  settingsSchema,
  updateTimelineSchema,
} from "./schemas.js";
import {
  applyTimelineUpdate,
  fastInsulinEntries,
  logMeal,
} from "./timeline.js";
import { learnVocabulary } from "./vocabulary.js";

const TIME_ZONE_HEADER = "X-Timezone";

export interface RouteDependencies {
  calculator: Calculator;
  repositories: Repositories;
  apiKeys: ApiKeyStore;
  clock: Clock;
  newId: IdGenerator;
}

export function createRoutes({
  calculator,
  repositories,
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
    const settings = await repositories.settings.get();
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
    const vocabulary = await repositories.vocabulary.list();

    try {
      const timeline = await repositories.timeline.list();
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
    const settings = await repositories.settings.get();
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

    await repositories.timeline.add(entries);
    await repositories.vocabulary.upsert(
      learnVocabulary(
        await repositories.vocabulary.list(),
        parsed.data.result.items,
        now,
      ),
    );

    const response: LogMealResponse = {
      meal_entry_id: meal.id,
      insulin_entry_id: insulin?.id ?? null,
    };
    return c.json(response);
  });

  api.get("/api/settings", async (c) => {
    const settings = await repositories.settings.get();
    return c.json(settings);
  });

  api.put("/api/settings", async (c) => {
    const body = await c.req.json();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    await repositories.settings.save(parsed.data);
    return c.json(parsed.data);
  });

  api.get("/api/timeline", async (c) => {
    const timeline = await repositories.timeline.list();
    return c.json(timeline);
  });

  api.get("/api/iob", async (c) => {
    const settings = await repositories.settings.get();
    if (settings.insulin_action_minutes === null) {
      return apiError(c, "insulin_action_not_configured", 400);
    }
    const timeline = await repositories.timeline.list();
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
      const settings = await repositories.settings.get();
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
      await repositories.timeline.add([entry]);
      return c.json(entry, 201);
    }

    if (data.type === "slow_insulin") {
      const settings = await repositories.settings.get();
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
      await repositories.timeline.add([entry]);
      return c.json(entry, 201);
    }

    const entry: GlucoseEntry = {
      id,
      timestamp,
      type: "glucose_reading",
      value: data.value,
      unit: data.unit,
    };
    await repositories.timeline.add([entry]);
    return c.json(entry, 201);
  });

  api.put("/api/timeline/:id", async (c) => {
    const id = c.req.param("id");
    const parsed = updateTimelineSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    const existing = await repositories.timeline.get(id);
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
    await repositories.timeline.replace(update.entry);
    return c.json(update.entry);
  });

  api.delete("/api/timeline/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await repositories.timeline.delete(id);
    if (!deleted) {
      return apiError(c, "not_found", 404);
    }
    return c.json({ ok: true });
  });

  api.delete("/api/timeline", async (c) => {
    await repositories.timeline.clear();
    return c.json({ ok: true });
  });

  return api;
}
