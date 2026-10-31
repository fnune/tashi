import {
  ApiKeyStore,
  type ApiKeyStoreOptions,
} from "@tashi/backend/api-key-store";
import { Calculator } from "@tashi/backend/calculator";
import { DiaryImport } from "@tashi/backend/diary-import";
import { Doses } from "@tashi/backend/doses";
import type { FoodCatalog } from "@tashi/backend/food-catalog";
import type { FoodParser, ParseOutcome } from "@tashi/backend/food-parser";
import { randomId } from "@tashi/backend/ids";
import { KeyedFoodParser } from "@tashi/backend/keyed-food-parser";
import { passwordGate } from "@tashi/backend/password-gate";
import type { Repositories } from "@tashi/backend/repositories";
import { createRoutes } from "@tashi/backend/routes";
import { TimelineService } from "@tashi/backend/timeline-service";
import type { FoodVocabEntry, ParsedFoodItem } from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { Hono } from "hono";

export const OPEN_PORT = 3100;
export const GATED_PORT = 3101;
export const GATE_PASSWORD = "e2e-password";
export const ENVIRONMENT_KEY = "sk-ant-from-the-server";

export const USER_TABLES = [
  "settings",
  "profile_window_ratios",
  "profiles",
  "meal_windows",
  "fast_insulin_entries",
  "meal_entries",
  "glucose_entries",
  "slow_insulin_entries",
  "ratio_versions",
  "food_vocabulary",
  "anthropic_api_key",
];

export interface TestAppOptions {
  repositories: Repositories;
  foodCatalog: FoodCatalog;
  timeZone: string;
  clearTables: () => Promise<void>;
  password?: string | undefined;
}

export function lunchtimeIn(timeZone: string, now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  );
  const localNowAsUtc = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
  );
  const offset = localNowAsUtc - Math.floor(now.getTime() / 60_000) * 60_000;
  return new Date(
    Date.UTC(parts.year ?? 0, (parts.month ?? 1) - 1, parts.day ?? 1, 13) -
      offset,
  );
}

export function buildTestApp(options: TestAppOptions): Hono {
  const { repositories, foodCatalog } = options;
  const lunchtimeClock = () => lunchtimeIn(options.timeZone, new Date());
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
    defaultTimeZone: options.timeZone,
  });

  const app = new Hono();
  if (options.password) app.use("*", passwordGate(options.password));

  app.post("/api/__reset", async (c) => {
    await options.clearTables();
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
  return app;
}

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
