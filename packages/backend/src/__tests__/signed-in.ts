import { Hono } from "hono";
import { AiConnections } from "../domain/ai-connections.js";
import type { Repositories } from "../domain/repositories.js";
import type { SignedIn } from "../http/authentication.js";
import { sequentialIds } from "./sequential-ids.js";

export const TEST_DATA_KEY = new Uint8Array(32).fill(7);

export function signedIn(
  routes: Hono<SignedIn>,
  dataKey: Uint8Array<ArrayBuffer> = TEST_DATA_KEY,
  role: "admin" | "member" = "admin",
): Hono<SignedIn> {
  const app = new Hono<SignedIn>();
  app.use(async (c, next) => {
    c.set("session", {
      account: { id: "account", name: "Ana", role },
      dataKey,
      renewedUntil: null,
    });
    await next();
  });
  app.route("/", routes);
  return app;
}

export function testAiConnections(
  repositories: Repositories,
  verify?: (apiKey: string) => Promise<boolean>,
): AiConnections {
  return new AiConnections(repositories.aiConnections, {
    kind: "anthropic",
    clock: () => new Date("2026-06-13T12:00:00.000Z"),
    newId: sequentialIds(500),
    verify,
  });
}
