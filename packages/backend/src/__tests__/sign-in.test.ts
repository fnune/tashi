import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { setupTokenWithHash } from "../domain/auth/setup-token.js";
import { sha256, toHex } from "../domain/auth/tokens.js";
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
  });
  app.all("*", (c) => c.text("the app"));
  return app;
}

const request = (path: string, init: RequestInit = {}) =>
  new Request(`${ORIGIN}${path}`, init);

function setUp(
  app: Awaited<ReturnType<typeof freshApp>>,
  fields: Record<string, string>,
) {
  return app.request(
    request("/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ORIGIN,
      },
      body: new URLSearchParams({ token: SETUP_TOKEN, ...fields }),
    }),
  );
}

function cookieFrom(response: Response): string {
  const cookie = response.headers.get("Set-Cookie") ?? "";
  return cookie.split(";")[0] ?? "";
}

async function claimed() {
  const app = await freshApp();
  const response = await setUp(app, {
    name: "Ana",
    password: "long enough",
    again: "long enough",
  });
  return { app, cookie: cookieFrom(response) };
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
    ]) {
      expect((await app.request(request(path))).status).toBe(404);
    }
  });

  it("shows the setup form to the setup link", async () => {
    const app = await freshApp();
    const response = await app.request(request(`/setup?token=${SETUP_TOKEN}`));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Set up Tashi");
  });

  it("speaks Spanish to a Spanish browser", async () => {
    const app = await freshApp();
    const response = await app.request(
      request(`/setup?token=${SETUP_TOKEN}`, {
        headers: { "Accept-Language": "es-ES,es;q=0.9" },
      }),
    );
    expect(await response.text()).toContain("Configurar Tashi");
  });

  it("is set up from the form, which signs its first account in", async () => {
    const app = await freshApp();
    const response = await setUp(app, {
      name: "Ana",
      password: "long enough",
      again: "long enough",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("Set-Cookie")).toMatch(/Max-Age=2592000/);
    const me = await app.request(
      request("/api/auth/me", { headers: { Cookie: cookieFrom(response) } }),
    );
    expect(await me.json()).toEqual({ name: "Ana", role: "admin" });
  });

  it("explains a password that was typed differently twice", async () => {
    const app = await freshApp();
    const response = await setUp(app, {
      name: "Ana",
      password: "long enough",
      again: "long enougj",
    });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("The two passwords are different.");
  });
});

describe("an instance that is set up", () => {
  it("closes the setup link", async () => {
    const { app } = await claimed();
    const response = await app.request(request(`/setup?token=${SETUP_TOKEN}`));
    expect(response.status).toBe(404);
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
        body: JSON.stringify({ name: "ana", password: "long enough" }),
      }),
    );
    expect(signIn.status).toBe(200);
    const cookie = cookieFrom(signIn);
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
