import Anthropic from "@anthropic-ai/sdk";
import { type AiConnectionStatus, DEFAULT_SETTINGS } from "@tashi/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { sealText, unsealText } from "../domain/auth/data-key.js";
import { Calculator } from "../domain/calculator.js";
import { systemClock } from "../domain/clock.js";
import { DiaryImport } from "../domain/diary-import.js";
import { Doses } from "../domain/doses.js";
import { InvalidApiKeyError } from "../domain/errors.js";
import type { FoodParser } from "../domain/food-parser.js";
import { KeyedFoodParser } from "../domain/keyed-food-parser.js";
import type { Repositories } from "../domain/repositories.js";
import { TimelineService } from "../domain/timeline-service.js";
import { createRoutes } from "../http/routes.js";
import { FakeFoodParser } from "./fake-food-parser.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { sequentialIds } from "./sequential-ids.js";
import { signedIn, TEST_DATA_KEY, testAiConnections } from "./signed-in.js";
import { testBuild } from "./test-catalog.js";

const KEY = "sk-ant-test-key";
const OTHER_DATA_KEY = new Uint8Array(32).fill(9);

describe("sealing with the data key", () => {
  it("opens with the same data key only", async () => {
    const sealed = await sealText(KEY, TEST_DATA_KEY);
    expect(await unsealText(sealed, TEST_DATA_KEY)).toBe(KEY);
    expect(await unsealText(sealed, OTHER_DATA_KEY)).toBeNull();
  });

  it("does not contain the key", async () => {
    const sealed = await sealText(KEY, TEST_DATA_KEY);
    expect(new TextDecoder().decode(sealed)).not.toContain(KEY);
  });
});

describe("api key routes", () => {
  let repositories: Repositories;
  let foodCatalog: InMemoryFoodCatalog;
  let used: ({ model: string; apiKey: string } | null)[];
  let verified: string[];
  let accepted: boolean;

  function connections() {
    return testAiConnections(repositories, async (key) => {
      verified.push(key);
      return accepted;
    });
  }

  function routesFor(parser: FoodParser, dataKey = TEST_DATA_KEY) {
    const newId = sequentialIds();
    return signedIn(
      createRoutes({
        doses: new Doses(
          repositories,
          new Calculator(parser, foodCatalog, systemClock, newId),
          systemClock,
        ),
        timeline: new TimelineService(repositories, systemClock, newId),
        diaryImport: new DiaryImport(repositories),
        repositories,
        aiConnections: connections(),
        defaultTimeZone: "Europe/Berlin",
      }),
      dataKey,
    );
  }

  function app(dataKey = TEST_DATA_KEY) {
    const fake = new FakeFoodParser();
    fake.setResponse("an apple", []);
    return routesFor(
      new KeyedFoodParser({
        parse: (description, vocabulary, language, connection) => {
          used.push(
            connection && {
              model: connection.model,
              apiKey: connection.apiKey,
            },
          );
          return fake.parse(description, vocabulary, language, connection);
        },
      }),
      dataKey,
    );
  }

  async function put(
    to: ReturnType<typeof app>,
    path: string,
    body: unknown,
  ): Promise<Response> {
    return to.request(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const putKey = (to: ReturnType<typeof app>, api_key: string) =>
    put(to, "/api/ai-connection", { api_key });

  async function status(
    of: ReturnType<typeof app>,
  ): Promise<AiConnectionStatus> {
    return (await (
      await of.request("/api/ai-connection")
    ).json()) as AiConnectionStatus;
  }

  async function calculate(with_: ReturnType<typeof app>): Promise<Response> {
    return with_.request("/api/calculate", {
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
    used = [];
    verified = [];
    accepted = true;
  });

  it("starts without a key and says so when calculating", async () => {
    const tashi = app();
    expect(await status(tashi)).toMatchObject({
      connected: false,
      model: "claude-haiku-5-5",
    });
    const res = await calculate(tashi);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_missing",
    );
  });

  it("saves a verified key sealed and uses it for calculations", async () => {
    const tashi = app();
    const res = await putKey(tashi, `  ${KEY}  `);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ connected: true });
    expect(verified).toEqual([KEY]);
    const stored = await repositories.aiConnections.get("anthropic");
    expect(new TextDecoder().decode(stored?.sealedApiKey)).not.toContain(KEY);

    expect((await calculate(tashi)).status).toBe(200);
    expect(used).toEqual([{ model: "claude-haiku-5-5", apiKey: KEY }]);
  });

  it("cannot open the saved key without the instance's data key", async () => {
    await putKey(app(), KEY);
    expect((await status(app(OTHER_DATA_KEY))).connected).toBe(false);
  });

  it("never returns the key", async () => {
    const tashi = app();
    await putKey(tashi, KEY);
    for (const path of ["/api/ai-connection", "/api/settings"]) {
      expect(await (await tashi.request(path)).text()).not.toContain(KEY);
    }
  });

  it("rejects a key the provider does not accept without saving it", async () => {
    accepted = false;
    const tashi = app();
    const res = await putKey(tashi, KEY);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_invalid",
    );
    expect((await status(tashi)).connected).toBe(false);
  });

  it("rejects blank keys and keys with whitespace inside", async () => {
    const tashi = app();
    expect((await putKey(tashi, "   ")).status).toBe(400);
    expect((await putKey(tashi, "sk-ant a b")).status).toBe(400);
    expect(verified).toEqual([]);
  });

  it("forgets the key when it is removed", async () => {
    const tashi = app();
    await putKey(tashi, KEY);
    const removed = await tashi.request("/api/ai-connection", {
      method: "DELETE",
    });
    expect(await removed.json()).toMatchObject({ connected: false });
    expect(await repositories.aiConnections.get("anthropic")).toBeNull();
  });

  it("calculates with the model chosen in Settings", async () => {
    const tashi = app();
    await putKey(tashi, KEY);
    const chosen = await put(tashi, "/api/ai-connection/model", {
      model: "claude-sonnet-5-5",
    });
    expect(await chosen.json()).toMatchObject({ model: "claude-sonnet-5-5" });
    await calculate(tashi);
    expect(used).toEqual([{ model: "claude-sonnet-5-5", apiKey: KEY }]);
  });

  it("offers only models it knows the price of", async () => {
    const tashi = app();
    await putKey(tashi, KEY);
    const res = await put(tashi, "/api/ai-connection/model", {
      model: "some-other-model",
    });
    expect(res.status).toBe(400);
    expect((await status(tashi)).models.map((m) => m.id)).toContain(
      "claude-haiku-5-5",
    );
  });

  it("has no model to change before a key is saved", async () => {
    const res = await put(app(), "/api/ai-connection/model", {
      model: "claude-sonnet-5-5",
    });
    expect(res.status).toBe(404);
  });

  it("says the Anthropic credit ran out, however Anthropic phrases it", async () => {
    await connections().connect(TEST_DATA_KEY, KEY);
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
      const parser = new KeyedFoodParser({
        parse: async () => {
          throw error;
        },
      });
      const res = await calculate(routesFor(parser));
      expect(await res.json()).toMatchObject({
        code: "credit_exhausted",
      });
    }
  });

  it("reports a rejected key from the provider as api_key_invalid", async () => {
    await connections().connect(TEST_DATA_KEY, KEY);
    const parser = new KeyedFoodParser({
      parse: async () => {
        throw new InvalidApiKeyError();
      },
    });
    const res = await calculate(routesFor(parser));
    expect(((await res.json()) as { code: string }).code).toBe(
      "api_key_invalid",
    );
  });
});
