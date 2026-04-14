import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command: "npx tsx test-server.ts",
    port: 3100,
    reuseExistingServer: false,
  },
});
