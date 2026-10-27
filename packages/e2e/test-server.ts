import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { ApiKeyStore } from "@tashi/backend/api-key-store";
import { Calculator } from "@tashi/backend/calculator";
import { Doses } from "@tashi/backend/doses";
import { openFileRepositories } from "@tashi/backend/file-repositories";
// E2E tests use the real food database
import { FoodDatabase } from "@tashi/backend/food-db";
import type { FoodParser, ParseOutcome } from "@tashi/backend/food-parser";
import { randomId } from "@tashi/backend/ids";
import { createRoutes } from "@tashi/backend/routes";
import { TimelineService } from "@tashi/backend/timeline-service";
import type { FoodVocabEntry, ParsedFoodItem } from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";

class FakeFoodParser implements FoodParser {
  async parse(
    foodDescription: string,
    _vocabulary: FoodVocabEntry[] = [],
    _language: "en" | "es" = "en",
  ): Promise<ParseOutcome> {
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
          fdc_id: 169756,
          weight_g: weight,
          assumed_cooked: true,
          confidence: "high",
          notes: null,
          estimated_net_carbs_per_100g: 28,
          user_carbs: null,
          estimated_glycemic_index: 73,
          estimated_fat_per_100g: null,
          estimated_protein_per_100g: null,
          warning: null,
        },
      ];

      if (lower.includes("pollo") || lower.includes("chicken")) {
        items.push({
          description: lower.includes("pollo")
            ? "Pechuga de pollo (plancha)"
            : "Chicken breast (grilled)",
          fdc_id: 171534,
          weight_g: 170,
          assumed_cooked: true,
          confidence: "high",
          notes: null,
          estimated_net_carbs_per_100g: 0,
          user_carbs: null,
          estimated_glycemic_index: null,
          estimated_fat_per_100g: null,
          estimated_protein_per_100g: null,
          warning: null,
        });
      }

      return this.result(items);
    }

    if (lower.includes("banana") || lower.includes("platano")) {
      return this.result([
        {
          description: lower.includes("platano") ? "Platano" : "Banana",
          fdc_id: 173944,
          weight_g: 120,
          assumed_cooked: false,
          confidence: "medium",
          notes: lower.includes("platano")
            ? "Asumido platano mediano (~120g)"
            : "Assumed medium banana (~120g)",
          estimated_net_carbs_per_100g: 20,
          user_carbs: null,
          estimated_glycemic_index: 51,
          estimated_fat_per_100g: null,
          estimated_protein_per_100g: null,
          warning: null,
        },
      ]);
    }

    return this.result([
      {
        description: foodDescription,
        fdc_id: null,
        weight_g: 100,
        assumed_cooked: false,
        confidence: "low",
        notes: "Could not match to database",
        estimated_net_carbs_per_100g: 15.0,
        user_carbs: null,
        estimated_glycemic_index: 40,
        estimated_fat_per_100g: null,
        estimated_protein_per_100g: null,
        warning: null,
      },
    ]);
  }

  private result(items: ParsedFoodItem[]): ParseOutcome {
    return {
      status: "ok",
      items,
      trace: {
        searches: [],
        raw_response: JSON.stringify(items),
        model: "fake",
        duration_ms: 0,
      },
    };
  }
}

async function startServer(): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), "tashi-e2e-"));
  const repositories = await openFileRepositories(tmpDir);

  const foodDb = await FoodDatabase.open(
    join(import.meta.dirname, "../../data/foods.db"),
  );

  const parser = new FakeFoodParser();
  const lunchtimeClock = () => {
    const now = new Date();
    now.setHours(13, 0, 0, 0);
    return now;
  };
  const calculator = new Calculator(parser, foodDb, lunchtimeClock, randomId);

  const app = new Hono();
  app.use("/api/*", cors());

  app.post("/api/__reset", async (c) => {
    await repositories.timeline.clear();
    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      correction_factor: null,
      target_blood_sugar: 100,
      glucose_unit: "mg/dL",
      ratio_format: "grams_per_unit",
      pen_increment: 0.5,
      bolus_insulin_id: "novorapid",
      basal_insulin_id: "lantus",
      insulin_action_minutes: null,
      language: "en",
    });
    return c.json({ ok: true });
  });

  const routes = createRoutes({
    doses: new Doses(repositories, calculator, lunchtimeClock),
    timeline: new TimelineService(repositories, lunchtimeClock, randomId),
    repositories,
    apiKeys: new ApiKeyStore(repositories.apiKey),
  });
  app.route("/", routes);

  app.use("/*", serveStatic({ root: "../frontend/dist" }));

  app.get("/*", async (c) => {
    const fs = await import("node:fs/promises");
    const html = await fs.readFile("../frontend/dist/index.html", "utf-8");
    return c.html(html);
  });

  const port = 3100;
  console.log(`Test server listening on http://localhost:${port}`);
  serve({ fetch: app.fetch, port });
}

startServer();
