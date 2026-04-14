import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { AnthropicFoodParser } from "./anthropic-food-parser.js";
import { Calculator } from "./calculator.js";
import { createRoutes } from "./routes.js";
import { FileStorage } from "./storage.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY environment variable is required");
  process.exit(1);
}

const model = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001";
const port = Number(process.env.PORT ?? "3000");
const dataDir = process.env.DATA_DIR ?? "./data";
const basePath = process.env.BASE_PATH ?? "";

const storage = new FileStorage(dataDir);
await storage.init();

const parser = new AnthropicFoodParser(apiKey, model);
const calculator = new Calculator(parser);

const app = new Hono();

app.use(`${basePath}/api/*`, cors());

const routes = createRoutes(calculator, storage);
app.route(basePath || "/", routes);

app.use(
  `${basePath}/*`,
  serveStatic({
    root: "./public",
    rewriteRequestPath: (path) =>
      basePath ? path.replace(basePath, "") : path,
  }),
);

app.get(`${basePath}/*`, async (c) => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile("./public/index.html", "utf-8");
  return c.html(html);
});

console.log(`Listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
