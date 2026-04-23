import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CalculateResponse, TimelineEntry } from "@pincho/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Calculator } from "../calculator.js";
import type { FoodDatabase } from "../db/food-db.js";
import { createRoutes } from "../routes.js";
import { FileStorage } from "../storage.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { createTestFoodDb } from "./test-food-db.js";

describe("API routes", () => {
  let app: ReturnType<typeof createRoutes>;
  let storage: FileStorage;
  let parser: FakeFoodParser;
  let foodDb: FoodDatabase;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pincho-test-"));
    storage = new FileStorage(tmpDir);
    await storage.init();
    parser = new FakeFoodParser();
    foodDb = await createTestFoodDb(tmpDir);
    const calculator = new Calculator(parser, foodDb);
    app = createRoutes(calculator, storage);
  });

  afterEach(async () => {
    foodDb.close();
    await rm(tmpDir, { recursive: true });
  });

  it("POST /api/calculate creates paired timeline entries with dose data", async () => {
    parser.setResponse("100g white rice", [
      {
        description: "White rice (cooked)",
        fdc_id: 169756,
        weight_g: 100,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 28,
        user_carbs: null,
        estimated_glycemic_index: 73,
        warning: null,
      },
    ]);

    await storage.saveSettings({
      meal_windows: [{ name: "lunch", start_hour: 0, end_hour: 24, ratio: 10 }],
      correction_factor: null,
      target_blood_sugar: 6.0,
      glucose_unit: "mg/dL",
      pen_increment: 0.5,
      language: "en",
    });

    const res = await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "100g white rice" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as CalculateResponse;
    expect(body.result.items).toHaveLength(1);
    expect(body.result.total_net_carbs_g).toBeCloseTo(27.8, 0);
    expect(body.meal_entry_id).toBeDefined();
    expect(body.insulin_entry_id).toBeDefined();

    const timelineRes = await app.request("/api/timeline");
    const timeline = (await timelineRes.json()) as TimelineEntry[];
    expect(timeline).toHaveLength(2);

    const insulin = timeline.find((e) => e.type === "fast_insulin");
    const meal = timeline.find((e) => e.type === "meal");
    expect(insulin).toBeDefined();
    expect(meal).toBeDefined();
    if (insulin?.type === "fast_insulin") {
      expect(insulin.related_meal_id).toBe(meal?.id);
    }
    if (meal?.type === "meal") {
      expect(meal.recommended_dose).toBe(body.result.recommended_dose);
      expect(meal.correction).toEqual(body.result.correction);
    }
  });

  it("POST /api/calculate offsets meal timestamp by pre_bolus_minutes", async () => {
    parser.setResponse("a banana", [
      {
        description: "Banana",
        fdc_id: 173944,
        weight_g: 120,
        assumed_cooked: false,
        confidence: "medium",
        notes: null,
        estimated_net_carbs_per_100g: 20,
        user_carbs: null,
        estimated_glycemic_index: 51,
        warning: null,
      },
    ]);

    await storage.saveSettings({
      meal_windows: [
        { name: "all-day", start_hour: 0, end_hour: 24, ratio: 10 },
      ],
      correction_factor: null,
      target_blood_sugar: 6.0,
      glucose_unit: "mg/dL",
      pen_increment: 0.5,
      language: "en",
    });

    await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        food_description: "a banana",
        pre_bolus_minutes: 15,
      }),
    });

    const timelineRes = await app.request("/api/timeline");
    const timeline = (await timelineRes.json()) as TimelineEntry[];
    const insulin = timeline.find((e) => e.type === "fast_insulin")!;
    const meal = timeline.find((e) => e.type === "meal")!;

    const insulinTime = new Date(insulin.timestamp).getTime();
    const mealTime = new Date(meal.timestamp).getTime();
    const diffMinutes = (mealTime - insulinTime) / 60_000;
    expect(diffMinutes).toBeCloseTo(15, 0);
  });

  it("POST /api/timeline creates manual entries", async () => {
    const fastRes = await app.request("/api/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fast_insulin", units: 4 }),
    });
    expect(fastRes.status).toBe(201);

    const slowRes = await app.request("/api/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "slow_insulin", units: 10 }),
    });
    expect(slowRes.status).toBe(201);

    const glucoseRes = await app.request("/api/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "glucose_reading",
        value: 120,
        unit: "mg/dL",
      }),
    });
    expect(glucoseRes.status).toBe(201);

    const timelineRes = await app.request("/api/timeline");
    const timeline = (await timelineRes.json()) as TimelineEntry[];
    expect(timeline).toHaveLength(3);

    const types = timeline.map((e) => e.type).sort();
    expect(types).toEqual(["fast_insulin", "glucose_reading", "slow_insulin"]);
  });

  it("DELETE /api/timeline/:id removes a single entry", async () => {
    await app.request("/api/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "slow_insulin", units: 10 }),
    });

    const timelineRes = await app.request("/api/timeline");
    const timeline = (await timelineRes.json()) as TimelineEntry[];
    expect(timeline).toHaveLength(1);

    const deleteRes = await app.request(`/api/timeline/${timeline[0]!.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const afterRes = await app.request("/api/timeline");
    const after = (await afterRes.json()) as TimelineEntry[];
    expect(after).toHaveLength(0);
  });

  it("GET/PUT /api/settings round-trips", async () => {
    const getRes = await app.request("/api/settings");
    expect(getRes.status).toBe(200);

    const settings = await getRes.json();
    const updated = { ...settings, pen_increment: 1, language: "es" };

    const putRes = await app.request("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    expect(putRes.status).toBe(200);

    const getRes2 = await app.request("/api/settings");
    const saved = await getRes2.json();
    expect(saved.pen_increment).toBe(1);
    expect(saved.language).toBe("es");
  });

  it("learns food vocabulary from calculations", async () => {
    parser.setResponse("100g white rice", [
      {
        description: "White rice (cooked)",
        fdc_id: 169756,
        weight_g: 100,
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: 28,
        user_carbs: null,
        estimated_glycemic_index: 73,
        warning: null,
      },
    ]);

    await storage.saveSettings({
      meal_windows: [{ name: "lunch", start_hour: 0, end_hour: 24, ratio: 10 }],
      correction_factor: null,
      target_blood_sugar: 6.0,
      glucose_unit: "mg/dL",
      pen_increment: 0.5,
      language: "en",
    });

    await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "100g white rice" }),
    });

    const vocab = await storage.getVocabulary();
    expect(vocab).toHaveLength(1);
    expect(vocab[0]!.fdc_id).toBe(169756);
    expect(vocab[0]!.description).toBe("White rice (cooked)");
    expect(vocab[0]!.use_count).toBe(1);

    await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "100g white rice" }),
    });

    const vocab2 = await storage.getVocabulary();
    expect(vocab2).toHaveLength(1);
    expect(vocab2[0]!.use_count).toBe(2);
    expect(vocab2[0]!.usda_description).toContain("Rice");
  });

  it("does not learn estimated items into vocabulary", async () => {
    parser.setResponse("100g acai bowl", [
      {
        description: "Acai bowl",
        fdc_id: null,
        weight_g: 100,
        assumed_cooked: false,
        confidence: "low",
        notes: null,
        estimated_net_carbs_per_100g: 15.0,
        user_carbs: null,
        estimated_glycemic_index: 35,
        warning: null,
      },
    ]);

    await storage.saveSettings({
      meal_windows: [{ name: "lunch", start_hour: 0, end_hour: 24, ratio: 10 }],
      correction_factor: null,
      target_blood_sugar: 6.0,
      glucose_unit: "mg/dL",
      pen_increment: 0.5,
      language: "en",
    });

    await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "100g acai bowl" }),
    });

    const vocab = await storage.getVocabulary();
    expect(vocab).toHaveLength(0);
  });

  it("rejects invalid calculate request", async () => {
    const res = await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("FileStorage error handling", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pincho-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("returns defaults when settings.json does not exist", async () => {
    const storage = new FileStorage(tmpDir);
    await storage.init();
    const settings = await storage.getSettings();
    expect(settings.language).toBe("en");
  });

  it("throws on corrupt settings.json", async () => {
    const storage = new FileStorage(tmpDir);
    await storage.init();
    await writeFile(join(tmpDir, "settings.json"), "not json{{{");
    await expect(storage.getSettings()).rejects.toThrow();
  });

  it("returns empty vocabulary when food-vocab.json does not exist", async () => {
    const storage = new FileStorage(tmpDir);
    await storage.init();
    const vocab = await storage.getVocabulary();
    expect(vocab).toEqual([]);
  });

  it("returns empty array when timeline.json does not exist", async () => {
    const storage = new FileStorage(tmpDir);
    await storage.init();
    const timeline = await storage.getTimeline();
    expect(timeline).toEqual([]);
  });

  it("throws on corrupt timeline.json", async () => {
    const storage = new FileStorage(tmpDir);
    await storage.init();
    await writeFile(join(tmpDir, "timeline.json"), "broken!");
    await expect(storage.getTimeline()).rejects.toThrow();
  });
});
