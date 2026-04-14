import type { CalculateRequest, Settings } from "@pincho/shared";
import { Hono } from "hono";
import { z } from "zod";
import type { Calculator } from "./calculator.js";
import type { FileStorage } from "./storage.js";

const calculateSchema = z.object({
  food_description: z.string().min(1),
  current_blood_sugar: z.number().positive().optional(),
  meal_window_override: z.string().optional(),
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
  language: z.union([z.literal("en"), z.literal("es")]),
});

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

    try {
      const result = await calculator.calculate(
        parsed.data.food_description,
        settings,
        parsed.data.current_blood_sugar,
        parsed.data.meal_window_override,
      );
      await storage.addToHistory(result);
      return c.json({ result });
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

  api.get("/api/history", async (c) => {
    const history = await storage.getHistory();
    return c.json(history);
  });

  api.delete("/api/history/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await storage.deleteFromHistory(id);
    if (!deleted) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ ok: true });
  });

  api.delete("/api/history", async (c) => {
    await storage.clearHistory();
    return c.json({ ok: true });
  });

  return api;
}
