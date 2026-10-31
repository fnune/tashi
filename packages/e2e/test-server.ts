import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  ApiKeyStore,
  type ApiKeyStoreOptions,
} from "@tashi/backend/api-key-store";
import { Calculator } from "@tashi/backend/calculator";
import { readCatalogFile } from "@tashi/backend/catalog-file";
import { DiaryImport } from "@tashi/backend/diary-import";
import { Doses } from "@tashi/backend/doses";
import type { FoodParser, ParseOutcome } from "@tashi/backend/food-parser";
import { randomId } from "@tashi/backend/ids";
import { KeyedFoodParser } from "@tashi/backend/keyed-food-parser";
import { passwordGate } from "@tashi/backend/password-gate";
import { createRoutes } from "@tashi/backend/routes";
import { openSqliteRepositories } from "@tashi/backend/sqlite";
import {
  catalogAssets,
  memoryAssets,
  readSearchIndex,
  StaticFoodCatalog,
} from "@tashi/backend/static-catalog";
import { TimelineService } from "@tashi/backend/timeline-service";
import type { FoodVocabEntry, ParsedFoodItem } from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { Hono } from "hono";

export const OPEN_PORT = 3100;
export const GATED_PORT = 3101;
export const GATE_PASSWORD = "e2e-password";
export const ENVIRONMENT_KEY = "sk-ant-from-the-server";

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
  const databaseDir = mkdtempSync(join(tmpdir(), "tashi-e2e-"));
  const databasePath = join(databaseDir, "tashi.sqlite");
  process.on("exit", () => rmSync(databaseDir, { recursive: true }));
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => process.exit(0));
  }

  const catalog = await readCatalogFile(
    join(import.meta.dirname, "../../data/foods.db"),
  );
  const catalogFiles = memoryAssets(catalogAssets(catalog));
  const searchIndex = await readSearchIndex(catalogFiles);
  if (!searchIndex) throw new Error("The catalog build has no search index");
  const { repositories } = await openSqliteRepositories(databasePath, {
    newId: randomId,
    catalogRelease: searchIndex.label,
  });
  const foodCatalog = new StaticFoodCatalog(searchIndex, catalogFiles);

  const lunchtimeClock = () => {
    const now = new Date();
    now.setHours(13, 0, 0, 0);
    return now;
  };

  const keyOptions: ApiKeyStoreOptions = {
    encryptionSecret: "e2e-secret",
    environmentKey: ENVIRONMENT_KEY,
    verify: async (key) =>
      key.startsWith("sk-ant-") && key !== "sk-ant-rejected",
  };
  const apiKeys = new ApiKeyStore(repositories.apiKey, keyOptions);
  const parser = new KeyedFoodParser(apiKeys, () => new FakeFoodParser());
  const calculator = new Calculator(
    parser,
    foodCatalog,
    lunchtimeClock,
    randomId,
  );

  const routes = createRoutes({
    doses: new Doses(repositories, calculator, lunchtimeClock),
    timeline: new TimelineService(repositories, lunchtimeClock, randomId),
    diaryImport: new DiaryImport(repositories),
    repositories,
    apiKeys,
    defaultTimeZone: "Europe/Berlin",
  });

  const sql = new DatabaseSync(databasePath);

  function build(options: { password?: string }): Hono {
    const app = new Hono();
    if (options.password) app.use("*", passwordGate(options.password));

    app.post("/api/__reset", async (c) => {
      sql.exec(`DELETE FROM settings; DELETE FROM profile_window_ratios;
        DELETE FROM profiles; DELETE FROM meal_windows;
        DELETE FROM fast_insulin_entries; DELETE FROM meal_entries;
        DELETE FROM glucose_entries; DELETE FROM slow_insulin_entries;
        DELETE FROM ratio_versions; DELETE FROM food_vocabulary;
        DELETE FROM anthropic_api_key;`);
      keyOptions.environmentKey =
        c.req.query("key") === "none" ? undefined : ENVIRONMENT_KEY;
      await apiKeys.clear();
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

    app.get("/api/__vocabulary", async (c) =>
      c.json(await repositories.vocabulary.list()),
    );

    app.route("/", routes);
    app.use("/*", serveStatic({ root: "../frontend/dist" }));
    app.get("/*", async (c) => {
      const fs = await import("node:fs/promises");
      const html = await fs.readFile("../frontend/dist/index.html", "utf-8");
      return c.html(html);
    });
    return app;
  }

  serve({ fetch: build({}).fetch, port: OPEN_PORT });
  serve({ fetch: build({ password: GATE_PASSWORD }).fetch, port: GATED_PORT });
  console.log(`Test server listening on http://localhost:${OPEN_PORT}`);
}

startServer();
