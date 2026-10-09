import type {
  BasalInsulinId,
  BolusInsulinId,
  CalculatedItem,
  CalculateRequest,
  CalculationResult,
  CreateTimelineRequest,
  FastInsulinEntry,
  GlucoseEntry,
  LogMealResponse,
  MealEntry,
  Settings,
  SlowInsulinEntry,
  TimelineEntry,
  UpdateTimelineRequest,
} from "@pincho/shared";
import {
  basalInsulinProfiles,
  bolusInsulinProfiles,
  findMealWindow,
  insulinOnBoard,
  MAX_CYCLE_DAYS,
  MAX_DIA_MINUTES,
  MIN_CYCLE_DAYS,
  MIN_DIA_MINUTES,
  NORMAL_PROFILE_ID,
} from "@pincho/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Calculator } from "./calculator.js";
import { type Clock, systemClock } from "./clock.js";
import { apiError } from "./errors.js";
import type { FileStorage } from "./storage.js";

const calculateSchema = z.object({
  food_description: z.string().min(1),
  current_blood_sugar: z.number().positive().optional(),
  meal_window_override: z.string().optional(),
});

const bolusInsulinIdSchema = z.enum(
  bolusInsulinProfiles().map((p) => p.id) as [
    BolusInsulinId,
    ...BolusInsulinId[],
  ],
);

const basalInsulinIdSchema = z.enum(
  basalInsulinProfiles().map((p) => p.id) as [
    BasalInsulinId,
    ...BasalInsulinId[],
  ],
);

const settingsSchema = z
  .object({
    meal_windows: z.array(
      z.object({
        name: z.string(),
        start_hour: z.number().min(0).max(23),
        end_hour: z.number().min(0).max(24),
        ratio: z.number().positive(),
      }),
    ),
    correction_factor: z.number().positive().nullable(),
    target_blood_sugar: z.number().positive(),
    glucose_unit: z.union([z.literal("mg/dL"), z.literal("mmol/L")]),
    ratio_format: z.enum(["grams_per_unit", "units_per_10g"]),
    pen_increment: z.union([z.literal(0.5), z.literal(1)]),
    fat_protein_multiplier: z.number().min(0).max(1),
    bolus_insulin_id: bolusInsulinIdSchema.nullable(),
    basal_insulin_id: basalInsulinIdSchema.nullable(),
    insulin_action_minutes: z
      .number()
      .min(MIN_DIA_MINUTES)
      .max(MAX_DIA_MINUTES)
      .nullable(),
    language: z.union([z.literal("en"), z.literal("es")]),
    profiles: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string(),
          emoji: z.string(),
          adjustment: z.discriminatedUnion("mode", [
            z.object({
              mode: z.literal("percent"),
              percent: z.number().min(-90).max(200),
            }),
            z.object({
              mode: z.literal("per_window"),
              ratios: z.record(z.string(), z.number().positive()),
            }),
          ]),
        }),
      )
      .refine((profiles) => profiles.some((p) => p.id === NORMAL_PROFILE_ID), {
        message: "The Normal profile cannot be removed",
      }),
    active_profile_id: z.string(),
    cycle: z.object({
      enabled: z.boolean(),
      last_period_start: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      length_days: z.number().int().min(MIN_CYCLE_DAYS).max(MAX_CYCLE_DAYS),
    }),
  })
  .refine((s) => s.profiles.some((p) => p.id === s.active_profile_id), {
    message: "The active profile must exist",
  });

const logMealSchema = z.object({
  result: z.object({
    input_text: z.string(),
    language: z.union([z.literal("en"), z.literal("es")]),
    meal_window: z.object({
      name: z.string(),
      start_hour: z.number(),
      end_hour: z.number(),
      ratio: z.number().positive(),
    }),
    items: z.array(z.custom<CalculatedItem>()),
    total_net_carbs_g: z.number(),
    recommended_dose: z.number(),
    correction: z.custom<CalculationResult["correction"]>().optional(),
    fat_protein_adjustment: z
      .custom<CalculationResult["fat_protein_adjustment"]>()
      .optional(),
    trace: z.custom<CalculationResult["trace"]>().optional(),
  }),
  units: z.number().min(0),
  pre_bolus_minutes: z.number().int().min(0).max(60).default(0),
});

const timelineEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fast_insulin"),
    units: z.number().positive(),
  }),
  z.object({
    type: z.literal("slow_insulin"),
    units: z.number().positive(),
  }),
  z.object({
    type: z.literal("glucose_reading"),
    value: z.number().positive(),
    unit: z.union([z.literal("mg/dL"), z.literal("mmol/L")]),
  }),
]);

export function createRoutes(
  calculator: Calculator,
  storage: FileStorage,
  clock: Clock = systemClock,
): Hono {
  const api = new Hono();

  api.post("/api/calculate", async (c) => {
    const body = await c.req.json<CalculateRequest>();
    const parsed = calculateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }

    const settings = await storage.getSettings();
    const bolusInsulinId = settings.bolus_insulin_id;
    if (bolusInsulinId === null) {
      return apiError(c, "bolus_insulin_not_configured", 400);
    }
    if (
      !parsed.data.meal_window_override &&
      findMealWindow(settings, clock()) === null
    ) {
      return apiError(c, "no_meal_window", 400);
    }
    const vocabulary = await storage.getVocabulary();

    try {
      const timeline = await storage.getTimeline();
      const fastEntries = timeline.filter(
        (e): e is FastInsulinEntry => e.type === "fast_insulin",
      );
      const iobUnits =
        settings.insulin_action_minutes === null
          ? 0
          : insulinOnBoard(fastEntries, settings, clock()).total_units;

      const outcome = await calculator.calculate(
        parsed.data.food_description,
        settings,
        parsed.data.current_blood_sugar,
        parsed.data.meal_window_override,
        vocabulary,
        iobUnits,
      );

      if (outcome.status !== "ok") {
        return c.json({
          status: outcome.status,
          message: outcome.message,
        });
      }

      return c.json({ status: "ok" as const, result: outcome.result });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return apiError(c, "internal_error", 500, message);
    }
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

    const { result } = parsed.data;
    const now = clock();
    const preBolusMs = parsed.data.pre_bolus_minutes * 60_000;
    const mealEntry: MealEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(now.getTime() + preBolusMs).toISOString(),
      type: "meal",
      input_text: result.input_text,
      language: result.language,
      meal_window: result.meal_window,
      items: result.items,
      total_net_carbs_g: result.total_net_carbs_g,
      recommended_dose: result.recommended_dose,
      correction: result.correction,
      fat_protein_adjustment: result.fat_protein_adjustment,
      trace: result.trace,
    };

    const entries: TimelineEntry[] = [mealEntry];
    let insulinEntryId: string | null = null;
    if (parsed.data.units > 0) {
      const insulinEntry: FastInsulinEntry = {
        id: crypto.randomUUID(),
        timestamp: now.toISOString(),
        type: "fast_insulin",
        units: parsed.data.units,
        insulin_id: bolusInsulinId,
        related_meal_id: mealEntry.id,
      };
      entries.push(insulinEntry);
      insulinEntryId = insulinEntry.id;
    }

    await storage.addTimelineEntries(entries);
    await storage.learnFromItems(result.items);

    const response: LogMealResponse = {
      meal_entry_id: mealEntry.id,
      insulin_entry_id: insulinEntryId,
    };
    return c.json(response);
  });

  api.get("/api/settings", async (c) => {
    const settings = await storage.getSettings();
    return c.json(settings);
  });

  api.put("/api/settings", async (c) => {
    const body = await c.req.json<Settings>();
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
    const fastEntries = timeline.filter(
      (e): e is FastInsulinEntry => e.type === "fast_insulin",
    );
    try {
      return c.json(insulinOnBoard(fastEntries, settings, clock()));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return apiError(c, "internal_error", 500, message);
    }
  });

  api.post("/api/timeline", async (c) => {
    const body = await c.req.json<CreateTimelineRequest>();
    const parsed = timelineEntrySchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }

    const data = parsed.data;
    const id = crypto.randomUUID();
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
    const body = await c.req.json<UpdateTimelineRequest>();
    const updated = await storage.updateTimelineEntry(id, body);
    if (!updated) {
      return apiError(c, "not_found", 404);
    }
    return c.json(updated);
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
