import Anthropic from "@anthropic-ai/sdk";
import { type ApiKeyStatus, DEFAULT_SETTINGS } from "@tashi/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiKeyStore } from "../domain/api-key-store.js";
import { Calculator } from "../domain/calculator.js";
import { systemClock } from "../domain/clock.js";
import { DiaryImport } from "../domain/diary-import.js";
import { Doses } from "../domain/doses.js";
import { InvalidApiKeyError } from "../domain/errors.js";
import type { FoodParser } from "../domain/food-parser.js";
import { KeyedFoodParser } from "../domain/keyed-food-parser.js";
import type { Repositories } from "../domain/repositories.js";
import { seal, unseal } from "../domain/secret-box.js";
import { TimelineService } from "../domain/timeline-service.js";
import { createRoutes } from "../http/routes.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { sequentialIds } from "./sequential-ids.js";
import { testBuild } from "./test-catalog.js";

const KEY = "sk-ant-test-key";

describe("secret box", () => {
  it("round-trips with the same secret key", async () => {
    expect(await unseal(await seal(KEY, "hunter2"), "hunter2")).toBe(KEY);
  });

  it("gives nothing back for another secret key or a tampered record", async () => {
    const sealed = await seal(KEY, "hunter2");
    expect(await unseal(sealed, "other")).toBeNull();
    const other = await seal("x", "hunter2");
    expect(await unseal({ ...sealed, data: other.data }, "hunter2")).toBeNull();
  });

  it("does not contain the key in the sealed record", async () => {
    expect(JSON.stringify(await seal(KEY, "hunter2"))).not.toContain(KEY);
  });
});

describe("api key routes", () => {
  let repositories: Repositories;
  let foodCatalog: InMemoryFoodCatalog;
  let created: string[];
  let verified: string[];
  let accepted: boolean;

  function routesFor(parser: FoodParser, apiKeys: ApiKeyStore) {
    const newId = sequentialIds();
    return createRoutes({
      doses: new Doses(
        repositories,
        new Calculator(parser, foodCatalog, systemClock, newId),
        systemClock,
      ),
      timeline: new TimelineService(repositories, systemClock, newId),
      diaryImport: new DiaryImport(repositories),
      repositories,
      apiKeys,
      defaultTimeZone: "Europe/Berlin",
    });
  }

  function appWith(options: {
    encryptionSecret?: string;
    environmentKey?: string;
  }) {
    const keys = new ApiKeyStore(repositories.apiKey, {
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
    return routesFor(parser, keys);
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
    repositories = createInMemoryRepositories();
    await repositories.settings.save({
      ...DEFAULT_SETTINGS,
      meal_windows: [
        { name: "all-day", start_hour: 0, end_hour: 24, ratio: 10 },
      ],
      bolus_insulin_id: "novorapid",
    });
    foodCatalog = new InMemoryFoodCatalog(testBuild.records);
    created = [];
    verified = [];
    accepted = true;
  });

  it("starts without a key and says so when calculating", async () => {
    const app = appWith({ encryptionSecret: "pw" });
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
    const app = appWith({ encryptionSecret: "pw" });
    const res = await putKey(app, `  ${KEY}  `);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      configured: true,
      source: "settings",
      can_save: true,
    });
    expect(verified).toEqual([KEY]);
    expect(JSON.stringify(await repositories.apiKey.get())).not.toContain(KEY);

    await calculate(app);
    expect(created).toEqual([KEY]);
  });

  it("keeps the saved key across restarts with the same passphrase only", async () => {
    await putKey(appWith({ encryptionSecret: "pw" }), KEY);
    expect((await status(appWith({ encryptionSecret: "pw" }))).configured).toBe(
      true,
    );
    expect(
      (await status(appWith({ encryptionSecret: "changed" }))).configured,
    ).toBe(false);
  });

  it("decrypts the saved key once, not on every request", async () => {
    await putKey(appWith({ encryptionSecret: "pw" }), KEY);
    let reads = 0;
    const counting = {
      get: () => {
        reads++;
        return repositories.apiKey.get();
      },
      save: repositories.apiKey.save.bind(repositories.apiKey),
      delete: repositories.apiKey.delete.bind(repositories.apiKey),
    };
    const keys = new ApiKeyStore(counting, { encryptionSecret: "pw" });
    await keys.get();
    await keys.get();
    await keys.status();
    expect(reads).toBe(1);
  });

  it("never returns the key", async () => {
    const app = appWith({
      encryptionSecret: "pw",
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
    const app = appWith({ encryptionSecret: "pw" });
    const res = await putKey(app, KEY);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_invalid",
    );
    expect((await status(app)).configured).toBe(false);
  });

  it("rejects blank keys and keys with whitespace inside", async () => {
    const app = appWith({ encryptionSecret: "pw" });
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
      encryptionSecret: "pw",
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

  it("says the Anthropic credit ran out, however Anthropic phrases it", async () => {
    const keys = new ApiKeyStore(repositories.apiKey, { environmentKey: KEY });
    for (const error of [
      Anthropic.APIError.generate(
        402,
        { type: "error", error: { type: "billing_error", message: "Billing" } },
        "Billing",
        new Headers(),
      ),
      Anthropic.APIError.generate(
        400,
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message:
              "Your credit balance is too low to access the Anthropic API.",
          },
        },
        "Your credit balance is too low to access the Anthropic API.",
        new Headers(),
      ),
    ]) {
      const parser = new KeyedFoodParser(keys, () => ({
        parse: async () => {
          throw error;
        },
      }));
      const res = await calculate(routesFor(parser, keys));
      expect(await res.json()).toMatchObject({
        code: "credit_exhausted",
      });
    }
  });

  it("reports a rejected key from the provider as api_key_invalid", async () => {
    const keys = new ApiKeyStore(repositories.apiKey, { environmentKey: KEY });
    const parser = new KeyedFoodParser(keys, () => ({
      parse: async () => {
        throw new InvalidApiKeyError();
      },
    }));
    const app = routesFor(parser, keys);
    const res = await calculate(app);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_invalid",
    );
  });
});
