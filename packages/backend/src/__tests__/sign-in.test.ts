import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { setupTokenWithHash } from "../domain/auth/setup-token.js";
import { sha256, toHex } from "../domain/auth/tokens.js";
import { silentLogger } from "../domain/logger.js";
import { InMemoryFoodCatalog } from "./in-memory-food-catalog.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { sequentialIds } from "./sequential-ids.js";
import { testBuild } from "./test-catalog.js";

const SETUP_TOKEN = "setup-token-from-the-build";
const ORIGIN = "https://tashi.example.workers.dev";

async function freshApp() {
  const hash = toHex(await sha256(new TextEncoder().encode(SETUP_TOKEN)));
  const { app } = createApp({
    config: { basePath: "" },
    setupToken: setupTokenWithHash(hash),
    repositories: createInMemoryRepositories(),
    foodCatalog: new InMemoryFoodCatalog(testBuild.records),
    fetch: async () => new Response(null, { status: 500 }),
    clock: () => new Date("2026-06-13T12:00:00.000Z"),
    newId: sequentialIds(),
    logger: silentLogger,
  });
  app.all("*", (c) => c.text("the app"));
  return app;
}

const request = (path: string, init: RequestInit = {}) =>
  new Request(`${ORIGIN}${path}`, init);

const PASSWORD = "correct horse battery";

function cookieFrom(response: Response, name: string): string {
  return (
    response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0] ?? "")
      .find((cookie) => cookie.startsWith(`${name}=`)) ?? ""
  );
}

async function openSetupLink(app: Awaited<ReturnType<typeof freshApp>>) {
  const response = await app.request(request(`/setup?token=${SETUP_TOKEN}`));
  return { response, setupCookie: cookieFrom(response, "tashi_setup") };
}

async function setUp(
  app: Awaited<ReturnType<typeof freshApp>>,
  body: { name: string; password: string },
  setupCookie?: string,
) {
  const cookie = setupCookie ?? (await openSetupLink(app)).setupCookie;
  return app.request(
    request("/api/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    }),
  );
}

async function claimed() {
  const app = await freshApp();
  const response = await setUp(app, { name: "Ana", password: PASSWORD });
  return { app, cookie: cookieFrom(response, "tashi_session") };
}

describe("an instance nobody has set up", () => {
  it("answers not found everywhere, without the setup token", async () => {
    const app = await freshApp();
    for (const path of [
      "/",
      "/setup",
      "/setup?token=guess",
      "/api/health",
      "/api/settings",
      "/assets/index.js",
    ]) {
      expect((await app.request(request(path))).status).toBe(404);
    }
  });

  it("takes the setup link's token into a cookie and drops it from the address", async () => {
    const app = await freshApp();
    const { response, setupCookie } = await openSetupLink(app);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/setup");
    expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("Set-Cookie")).toMatch(/SameSite=Strict/i);
    expect(setupCookie).toBe(`tashi_setup=${SETUP_TOKEN}`);
  });

  it("lets the browser holding the setup cookie load the app", async () => {
    const app = await freshApp();
    const { setupCookie } = await openSetupLink(app);
    for (const path of ["/setup", "/assets/index.js"]) {
      const response = await app.request(
        request(path, { headers: { Cookie: setupCookie } }),
      );
      expect(await response.text()).toBe("the app");
    }
  });

  it("is set up by the browser holding the setup cookie, which signs its first account in", async () => {
    const app = await freshApp();
    const response = await setUp(app, { name: "Ana", password: PASSWORD });
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie();
    expect(cookies.find((c) => c.startsWith("tashi_session="))).toMatch(
      /HttpOnly.*Max-Age=2592000|Max-Age=2592000.*HttpOnly/i,
    );
    expect(cookies.find((c) => c.startsWith("tashi_setup="))).toMatch(
      /Max-Age=0/,
    );
    const cookie = cookieFrom(response, "tashi_session");
    const me = await app.request(
      request("/api/auth/me", { headers: { Cookie: cookie } }),
    );
    expect(await me.json()).toEqual({ name: "Ana", role: "admin" });
  });

  it("refuses a password shorter than 12 characters", async () => {
    const app = await freshApp();
    const response = await setUp(app, { name: "Ana", password: "short pass" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "password_too_short" });
  });

  it("refuses to set up without the setup cookie", async () => {
    const app = await freshApp();
    const response = await setUp(app, { name: "Ana", password: PASSWORD }, "");
    expect(response.status).toBe(404);
  });
});

describe("an instance that is set up", () => {
  it("closes the setup link", async () => {
    const { app } = await claimed();
    const response = await app.request(request(`/setup?token=${SETUP_TOKEN}`));
    expect(response.status).toBe(404);
    expect((await setUp(app, { name: "Eve", password: PASSWORD })).status).toBe(
      404,
    );
  });

  it("asks for a session on every API route but health", async () => {
    const { app } = await claimed();
    expect((await app.request(request("/api/health"))).status).toBe(200);
    const settings = await app.request(request("/api/settings"));
    expect(settings.status).toBe(401);
    expect(await settings.json()).toMatchObject({ code: "signed_out" });
  });

  it("signs in with the name and password and out again", async () => {
    const { app } = await claimed();
    const signIn = await app.request(
      request("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ name: "ana", password: PASSWORD }),
      }),
    );
    expect(signIn.status).toBe(200);
    const cookie = cookieFrom(signIn, "tashi_session");
    expect(
      (
        await app.request(
          request("/api/settings", { headers: { Cookie: cookie } }),
        )
      ).status,
    ).toBe(200);

    await app.request(
      request("/api/auth/sign-out", {
        method: "POST",
        headers: { Cookie: cookie, Origin: ORIGIN },
      }),
    );
    expect(
      (
        await app.request(
          request("/api/settings", { headers: { Cookie: cookie } }),
        )
      ).status,
    ).toBe(401);
  });

  it("refuses a wrong password", async () => {
    const { app } = await claimed();
    const response = await app.request(
      request("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN },
        body: JSON.stringify({ name: "Ana", password: "wrong password" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "sign_in_failed" });
  });

  it("refuses a form posted from another site", async () => {
    const { app, cookie } = await claimed();
    const response = await app.request(
      request("/api/auth/sign-out", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://evil.example",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }),
    );
    expect(response.status).toBe(403);
  });
});
