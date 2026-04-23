import type {
  CalculateRequest,
  CreateTimelineRequest,
  FastInsulinEntry,
  GlucoseEntry,
  MealEntry,
  Settings,
  SlowInsulinEntry,
  UpdateTimelineRequest,
} from "@pincho/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Calculator } from "./calculator.js";
import type { FileStorage } from "./storage.js";

const calculateSchema = z.object({
  food_description: z.string().min(1),
  current_blood_sugar: z.number().positive().optional(),
  meal_window_override: z.string().optional(),
  pre_bolus_minutes: z.number().min(0).max(60).optional(),
});

const settingsSchema = z.object({
  meal_windows: z.array(
    z.object({
      name: z.string(),
      start_hour: z.number().min(0).max(23),
      end_hour: z.number().min(0).max(23),
      ratio: z.number().positive(),
    }),
  ),
  correction_factor: z.number().positive().nullable(),
  target_blood_sugar: z.number().positive(),
  glucose_unit: z.union([z.literal("mg/dL"), z.literal("mmol/L")]),
  pen_increment: z.union([z.literal(0.5), z.literal(1)]),
  fat_protein_multiplier: z.number().min(0).max(1),
  language: z.union([z.literal("en"), z.literal("es")]),
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
): Hono {
  const api = new Hono();

  api.post("/api/calculate", async (c) => {
    const body = await c.req.json<CalculateRequest>();
    const parsed = calculateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }

    const settings = await storage.getSettings();
    const vocabulary = await storage.getVocabulary();

    try {
      const result = await calculator.calculate(
        parsed.data.food_description,
        settings,
        parsed.data.current_blood_sugar,
        parsed.data.meal_window_override,
        vocabulary,
      );

      const preBolusMs = (parsed.data.pre_bolus_minutes ?? 0) * 60_000;
      const now = new Date();

      const doseUnits =
        result.fat_protein_adjustment?.total_dose ??
        result.correction?.total_dose ??
        result.recommended_dose;

      const mealEntry: MealEntry = {
        id: result.id,
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

      const insulinEntry: FastInsulinEntry = {
        id: crypto.randomUUID(),
        timestamp: now.toISOString(),
        type: "fast_insulin",
        units: doseUnits,
        related_meal_id: mealEntry.id,
      };

      await storage.addTimelineEntries([insulinEntry, mealEntry]);
      await storage.learnFromItems(result.items);

      return c.json({
        result,
        meal_entry_id: mealEntry.id,
        insulin_entry_id: insulinEntry.id,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  api.get("/api/settings", async (c) => {
    const settings = await storage.getSettings();
    return c.json(settings);
  });

  api.put("/api/settings", async (c) => {
    const body = await c.req.json<Settings>();
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }
    await storage.saveSettings(parsed.data);
    return c.json(parsed.data);
  });

  api.get("/api/timeline", async (c) => {
    const timeline = await storage.getTimeline();
    return c.json(timeline);
  });

  api.post("/api/timeline", async (c) => {
    const body = await c.req.json<CreateTimelineRequest>();
    const parsed = timelineEntrySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.message }, 400);
    }

    const data = parsed.data;
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    if (data.type === "fast_insulin") {
      const entry: FastInsulinEntry = {
        id,
        timestamp,
        type: "fast_insulin",
        units: data.units,
        related_meal_id: null,
      };
      await storage.addTimelineEntry(entry);
      return c.json(entry, 201);
    }

    if (data.type === "slow_insulin") {
      const entry: SlowInsulinEntry = {
        id,
        timestamp,
        type: "slow_insulin",
        units: data.units,
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
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(updated);
  });

  api.delete("/api/timeline/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await storage.deleteTimelineEntry(id);
    if (!deleted) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  });

  api.delete("/api/timeline", async (c) => {
    await storage.clearTimeline();
    return c.json({ ok: true });
  });

  return api;
}
