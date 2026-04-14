import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Calculator } from "@pincho/backend/calculator";
import type { FoodParser } from "@pincho/backend/food-parser";
import { createRoutes } from "@pincho/backend/routes";
import { FileStorage } from "@pincho/backend/storage";
import type { ParsedFoodItem } from "@pincho/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";

class FakeFoodParser implements FoodParser {
  async parse(
    foodDescription: string,
    _foodIndex: string,
  ): Promise<ParsedFoodItem[]> {
    const lower = foodDescription.toLowerCase();

    if (lower.includes("arroz") || lower.includes("rice")) {
      const weightMatch = foodDescription.match(/(\d+)\s*g/);
      const weight = weightMatch?.[1]
        ? Number.parseInt(weightMatch[1], 10)
        : 150;
      const items: ParsedFoodItem[] = [
        {
          description: lower.includes("arroz")
            ? "Arroz blanco (cocido)"
            : "White rice (cooked)",
          weight_g: weight,
          db_key: "rice_white_cooked",
          assumed_cooked: true,
          confidence: "high",
          notes: null,
          estimated_net_carbs_per_100g: null,
          warning: null,
        },
      ];

      if (lower.includes("pollo") || lower.includes("chicken")) {
        items.push({
          description: lower.includes("pollo")
            ? "Pechuga de pollo (plancha)"
            : "Chicken breast (grilled)",
          weight_g: 170,
          db_key: "chicken_breast_grilled",
          assumed_cooked: true,
          confidence: "high",
          notes: null,
          estimated_net_carbs_per_100g: null,
          warning: null,
        });
      }

      return items;
    }

    if (lower.includes("banana") || lower.includes("platano")) {
      return [
        {
          description: lower.includes("platano") ? "Platano" : "Banana",
          weight_g: 120,
          db_key: "banana",
          assumed_cooked: false,
          confidence: "medium",
          notes: lower.includes("platano")
            ? "Asumido platano mediano (~120g)"
            : "Assumed medium banana (~120g)",
          estimated_net_carbs_per_100g: null,
          warning: null,
        },
      ];
    }

    return [
      {
        description: foodDescription,
        weight_g: 100,
        db_key: null,
        assumed_cooked: false,
        confidence: "low",
        notes: "Could not match to database",
        estimated_net_carbs_per_100g: 15.0,
        warning: null,
      },
    ];
  }
}

async function startServer(): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), "pincho-e2e-"));
  const storage = new FileStorage(tmpDir);
  await storage.init();

  const parser = new FakeFoodParser();
  const calculator = new Calculator(parser);

  const app = new Hono();
  app.use("/api/*", cors());

  app.post("/api/__reset", async (c) => {
    await storage.clearHistory();
    await storage.saveSettings({
      meal_windows: [
        { name: "morning", start_hour: 6, end_hour: 11, ratio: 8 },
        { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
        { name: "dinner", start_hour: 16, end_hour: 23, ratio: 12 },
      ],
      correction_factor: null,
      target_blood_sugar: 6.0,
      pen_increment: 0.5,
      language: "en",
    });
    return c.json({ ok: true });
  });

  const routes = createRoutes(calculator, storage);
  app.route("/", routes);

  app.use("/*", serveStatic({ root: "../frontend/dist" }));

  const port = 3100;
  console.log(`Test server listening on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

startServer();
