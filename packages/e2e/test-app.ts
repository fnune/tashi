import type { AiConnection } from "@tashi/backend/ai-connections";
import { AiConnections } from "@tashi/backend/ai-connections";
import { authenticate, type SignedIn } from "@tashi/backend/authenticate";
import {
  Authentication,
  type Authenticator,
} from "@tashi/backend/authentication";
import { Calculator } from "@tashi/backend/calculator";
import { DiaryImport } from "@tashi/backend/diary-import";
import type { FoodCatalog } from "@tashi/backend/food-catalog";
import type { FoodParser, ParseOutcome } from "@tashi/backend/food-parser";
import { randomId } from "@tashi/backend/ids";
import { InsulinUnits } from "@tashi/backend/insulin-units";
import { KeyedFoodParser } from "@tashi/backend/keyed-food-parser";
import { silentLogger } from "@tashi/backend/logger";
import { ProblemLog } from "@tashi/backend/problems";
import type { Repositories } from "@tashi/backend/repositories";
import { createRoutes } from "@tashi/backend/routes";
import { TimelineService } from "@tashi/backend/timeline-service";
import type { FoodVocabEntry, ParsedFoodItem } from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { Hono } from "hono";

export const SETUP_TOKEN = "e2e-setup-token";
const OPEN_DATA_KEY = new Uint8Array(32).fill(5);

export const USER_TABLES = [
  "sessions",
  "sign_in_failures",
  "password_methods",
  "sign_in_methods",
  "accounts",
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
  "anthropic_connections",
  "ai_connections",
  "model_usage",
  "problems",
];

export interface TestAppOptions {
  repositories: Repositories;
  foodCatalog: FoodCatalog;
  timeZone: string;
  clearTables: () => Promise<void>;
  withAccounts?: boolean;
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

export function buildTestApp(options: TestAppOptions): Hono<SignedIn> {
  const { repositories, foodCatalog } = options;
  const lunchtimeClock = () => lunchtimeIn(options.timeZone, new Date());
  const aiConnections = new AiConnections(repositories.aiConnections, {
    kind: "anthropic",
    clock: () => new Date(),
    newId: randomId,
    verify: async (key) =>
      key.startsWith("sk-ant-") && key !== "sk-ant-rejected",
  });
  const parser = new KeyedFoodParser(new FakeFoodParser());
  const calculator = new Calculator(
    parser,
    foodCatalog,
    lunchtimeClock,
    randomId,
  );
  const routes = createRoutes({
    insulinUnits: new InsulinUnits(repositories, calculator, lunchtimeClock),
    timeline: new TimelineService(repositories, lunchtimeClock, randomId),
    diaryImport: new DiaryImport(repositories),
    repositories,
    aiConnections,
    defaultTimeZone: options.timeZone,
    logger: silentLogger,
    problems: new ProblemLog(repositories.problems, () => new Date()),
  });

  const app = new Hono<SignedIn>();
  const newAuthentication = () =>
    new Authentication({
      accounts: repositories.accounts,
      sessions: repositories.sessions,
      signInFailures: repositories.signInFailures,
      setupToken: { accepts: async (token) => token === SETUP_TOKEN },
      clock: () => new Date(),
      newId: randomId,
      passwordIterations: 1000,
    });
  let authentication = newAuthentication();

  app.post("/api/__reset", async (c) => {
    await options.clearTables();
    authentication = newAuthentication();
    if (!options.withAccounts && c.req.query("key") !== "none") {
      await aiConnections.connect(OPEN_DATA_KEY, "sk-ant-e2e");
    }
    if (c.req.query("settings") === "none") return c.json({ ok: true });
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

  if (options.withAccounts) {
    const current: Authenticator = {
      isClaimed: () => authentication.isClaimed(),
      acceptsSetupToken: (token) => authentication.acceptsSetupToken(token),
      setUp: (token, name, password) =>
        authentication.setUp(token, name, password),
      signIn: (name, password) => authentication.signIn(name, password),
      session: (token) => authentication.session(token),
      signOut: (token) => authentication.signOut(token),
    };
    authenticate(app, current, "", silentLogger);
  } else {
    app.use("/api/*", async (c, next) => {
      c.set("session", {
        account: { id: "e2e", name: "E2E", role: "admin" },
        dataKey: OPEN_DATA_KEY,
        renewedUntil: null,
      });
      await next();
    });
    app.get("/api/auth/me", (c) => c.json({ name: "E2E", role: "admin" }));
  }

  app.route("/", routes);
  return app;
}

class FakeFoodParser implements FoodParser {
  async parse(
    foodDescription: string,
    _vocabulary: FoodVocabEntry[] = [],
    _language: "en" | "es" = "en",
    _connection: AiConnection | null = null,
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
          fdc_id: 169757,
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
      usage: {
        model: "claude-haiku-4-5",
        inputTokens: 1000,
        outputTokens: 200,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
      },
    };
  }
}
