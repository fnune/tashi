import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { passwordGate } from "../password-gate.js";

function appWith(password: string | undefined) {
  const app = new Hono();
  app.get("/base/api/health", (c) => c.json({ ok: true }));
  if (password) {
    app.use("*", passwordGate(password));
  }
  app.get("/base/api/settings", (c) => c.json({ secret: true }));
  app.get("/base/*", (c) => c.html("<html></html>"));
  return app;
}

function basic(user: string, password: string) {
  return { Authorization: `Basic ${btoa(`${user}:${password}`)}` };
}

describe("password gate", () => {
  it("does nothing when no password is set", async () => {
    const res = await appWith(undefined).request("/base/api/settings");
    expect(res.status).toBe(200);
  });

  it("rejects requests without credentials", async () => {
    const app = appWith("hunter2");
    for (const path of ["/base/api/settings", "/base/", "/base/some/page"]) {
      const res = await app.request(path);
      expect(res.status).toBe(401);
      expect(res.headers.get("WWW-Authenticate")).toContain("Basic");
    }
  });

  it("rejects a wrong password", async () => {
    const res = await appWith("hunter2").request("/base/api/settings", {
      headers: basic("me", "nope"),
    });
    expect(res.status).toBe(401);
  });

  it("accepts the right password with any username", async () => {
    const app = appWith("hunter2");
    for (const user of ["me", "", "someone-else"]) {
      const api = await app.request("/base/api/settings", {
        headers: basic(user, "hunter2"),
      });
      expect(api.status).toBe(200);
    }
    const page = await app.request("/base/", {
      headers: basic("me", "hunter2"),
    });
    expect(page.status).toBe(200);
  });

  it("keeps the health route open", async () => {
    const res = await appWith("hunter2").request("/base/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
