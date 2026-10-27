import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ApiKeyStatus, DEFAULT_SETTINGS } from "@tashi/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiKeyStore } from "../api-key-store.js";
import { Calculator } from "../calculator.js";
import type { FoodDatabase } from "../db/food-db.js";
import { InvalidApiKeyError } from "../errors.js";
import { KeyedFoodParser } from "../keyed-food-parser.js";
import { createRoutes } from "../routes.js";
import { seal, unseal } from "../secret-box.js";
import { FileStorage } from "../storage.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { createTestFoodDb } from "./test-food-db.js";

const KEY = "sk-ant-test-key";

describe("secret box", () => {
  it("round-trips with the same passphrase", () => {
    expect(unseal(seal(KEY, "hunter2"), "hunter2")).toBe(KEY);
  });

  it("gives nothing back for another passphrase or a tampered record", () => {
    const sealed = seal(KEY, "hunter2");
    expect(unseal(sealed, "other")).toBeNull();
    expect(
      unseal({ ...sealed, data: seal("x", "hunter2").data }, "hunter2"),
    ).toBeNull();
  });

  it("does not contain the key in the sealed record", () => {
    expect(JSON.stringify(seal(KEY, "hunter2"))).not.toContain(KEY);
  });
});

describe("api key routes", () => {
  let tmpDir: string;
  let storage: FileStorage;
  let foodDb: FoodDatabase;
  let created: string[];
  let verified: string[];
  let accepted: boolean;

  function appWith(options: {
    encryptionPassphrase?: string;
    environmentKey?: string;
  }) {
    const keys = new ApiKeyStore(storage, {
      ...options,
      verify: async (key) => {
        verified.push(key);
        return accepted;
      },
    });
    const parser = new KeyedFoodParser(keys, (apiKey) => {
      created.push(apiKey);
      return new FakeFoodParser();
    });
    const calculator = new Calculator(parser, foodDb);
    return createRoutes(calculator, storage, undefined, keys);
  }

  async function putKey(
    app: ReturnType<typeof appWith>,
    api_key: string,
  ): Promise<Response> {
    return app.request("/api/api-key", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key }),
    });
  }

  async function status(
    app: ReturnType<typeof appWith>,
  ): Promise<ApiKeyStatus> {
    return (await (await app.request("/api/api-key")).json()) as ApiKeyStatus;
  }

  async function calculate(app: ReturnType<typeof appWith>): Promise<Response> {
    return app.request("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ food_description: "an apple" }),
    });
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "tashi-test-"));
    storage = new FileStorage(tmpDir);
    await storage.init();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      meal_windows: [
        { name: "all-day", start_hour: 0, end_hour: 24, ratio: 10 },
      ],
      bolus_insulin_id: "novorapid",
    });
    foodDb = await createTestFoodDb(tmpDir);
    created = [];
    verified = [];
    accepted = true;
  });

  afterEach(async () => {
    foodDb.close();
    await rm(tmpDir, { recursive: true });
  });

  it("starts without a key and says so when calculating", async () => {
    const app = appWith({ encryptionPassphrase: "pw" });
    expect(await status(app)).toEqual({
      configured: false,
      source: null,
      can_save: true,
    });
    const res = await calculate(app);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_missing",
    );
  });

  it("saves a verified key encrypted and uses it for calculations", async () => {
    const app = appWith({ encryptionPassphrase: "pw" });
    const res = await putKey(app, `  ${KEY}  `);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      source: "settings",
      can_save: true,
    });
    expect(verified).toEqual([KEY]);
    expect(await readFile(join(tmpDir, "api-key.json"), "utf-8")).not.toContain(
      KEY,
    );

    await calculate(app);
    expect(created).toEqual([KEY]);
  });

  it("keeps the saved key across restarts with the same passphrase only", async () => {
    await putKey(appWith({ encryptionPassphrase: "pw" }), KEY);
    expect(
      (await status(appWith({ encryptionPassphrase: "pw" }))).configured,
    ).toBe(true);
    expect(
      (await status(appWith({ encryptionPassphrase: "changed" }))).configured,
    ).toBe(false);
  });

  it("decrypts the saved key once, not on every request", async () => {
    await putKey(appWith({ encryptionPassphrase: "pw" }), KEY);
    let reads = 0;
    const counting = {
      getApiKeyRecord: () => {
        reads++;
        return storage.getApiKeyRecord();
      },
      saveApiKeyRecord: storage.saveApiKeyRecord.bind(storage),
      deleteApiKeyRecord: storage.deleteApiKeyRecord.bind(storage),
    };
    const keys = new ApiKeyStore(counting, { encryptionPassphrase: "pw" });
    await keys.get();
    await keys.get();
    await keys.status();
    expect(reads).toBe(1);
  });

  it("never returns the key", async () => {
    const app = appWith({
      encryptionPassphrase: "pw",
      environmentKey: "sk-ant-env",
    });
    await putKey(app, KEY);
    const bodies = [
      await (await app.request("/api/api-key")).text(),
      await (await app.request("/api/settings")).text(),
    ];
    for (const body of bodies) {
      expect(body).not.toContain(KEY);
      expect(body).not.toContain("sk-ant-env");
    }
  });

  it("rejects a key Anthropic does not accept without saving it", async () => {
    accepted = false;
    const app = appWith({ encryptionPassphrase: "pw" });
    const res = await putKey(app, KEY);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_invalid",
    );
    expect((await status(app)).configured).toBe(false);
  });

  it("rejects blank keys and keys with whitespace inside", async () => {
    const app = appWith({ encryptionPassphrase: "pw" });
    expect((await putKey(app, "   ")).status).toBe(400);
    expect((await putKey(app, "sk-ant a b")).status).toBe(400);
    expect(verified).toEqual([]);
  });

  it("refuses to save without a passphrase but still uses the environment key", async () => {
    const app = appWith({ environmentKey: "sk-ant-env" });
    expect(await status(app)).toEqual({
      configured: true,
      source: "environment",
      can_save: false,
    });
    const res = await putKey(app, KEY);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_storage_unavailable",
    );
    await calculate(app);
    expect(created).toEqual(["sk-ant-env"]);
  });

  it("prefers the saved key over the environment key and falls back after removal", async () => {
    const app = appWith({
      encryptionPassphrase: "pw",
      environmentKey: "sk-ant-env",
    });
    await putKey(app, KEY);
    await calculate(app);
    const removed = await app.request("/api/api-key", { method: "DELETE" });
    expect(await removed.json()).toEqual({
      configured: true,
      source: "environment",
      can_save: true,
    });
    await calculate(app);
    expect(created).toEqual([KEY, "sk-ant-env"]);
  });

  it("reports a rejected key from the provider as api_key_invalid", async () => {
    const keys = new ApiKeyStore(storage, { environmentKey: KEY });
    const parser = new KeyedFoodParser(keys, () => ({
      parse: async () => {
        throw new InvalidApiKeyError();
      },
    }));
    const app = createRoutes(
      new Calculator(parser, foodDb),
      storage,
      undefined,
      keys,
    );
    const res = await calculate(app);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_invalid",
    );
  });
});
