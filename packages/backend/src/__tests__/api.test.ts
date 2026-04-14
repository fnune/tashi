import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CalculateResponse } from "@pincho/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Calculator } from "../calculator.js";
import { createRoutes } from "../routes.js";
import { FileStorage } from "../storage.js";
import { FakeFoodParser } from "./fake-food-parser.js";

describe("API routes", () => {
  let app: ReturnType<typeof createRoutes>;
  let storage: FileStorage;
  let parser: FakeFoodParser;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pincho-test-"));
    storage = new FileStorage(tmpDir);
    await storage.init();
    parser = new FakeFoodParser();
    const calculator = new Calculator(parser);
    app = createRoutes(calculator, storage);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  it("POST /api/calculate returns carb breakdown and dose", async () => {
    parser.setResponse("100g white rice", [
      {
        description: "White rice (cooked)",
        weight_g: 100,
        db_key: "rice_white_cooked",
        assumed_cooked: true,
        confidence: "high",
        notes: null,
        estimated_net_carbs_per_100g: null,
        warning: null,
      },
    ]);

    await storage.saveSettings({
      meal_windows: [{ name: "lunch", start_hour: 0, end_hour: 24, ratio: 10 }],
      correction_factor: null,
      target_blood_sugar: 6.0,
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
    expect(body.result.recommended_dose).toBeGreaterThan(0);
  });

  it("GET/PUT /api/settings round-trips", async () => {
    const getRes = await app.request("/api/settings");
    expect(getRes.status).toBe(200);

    const settings = await getRes.json();
    const updated = {
      ...settings,
      pen_increment: 1,
      language: "es",
    };

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

  it("history CRUD works end-to-end", async () => {
    parser.setResponse("a banana", [
      {
        description: "Banana",
        weight_g: 120,
        db_key: "banana",
        assumed_cooked: false,
        confidence: "medium",
        notes: null,
        estimated_net_carbs_per_100g: null,
        warning: null,
      },
    ]);

    await storage.saveSettings({
      meal_windows: [
        { name: "all-day", start_hour: 0, end_hour: 24, ratio: 10 },
      ],
      correction_factor: null,
      target_blood_sugar: 6.0,
      pen_increment: 0.5,
      language: "en",
    });

    await app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "a banana" }),
    });

    const historyRes = await app.request("/api/history");
    const history = (await historyRes.json()) as Array<{ id: string }>;
    expect(history).toHaveLength(1);

    const deleteRes = await app.request(`/api/history/${history[0]!.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const historyRes2 = await app.request("/api/history");
    const history2 = await historyRes2.json();
    expect(history2).toHaveLength(0);
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
