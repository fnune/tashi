import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  // Every test resets the one shared test server, so they cannot overlap.
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npx tsx test-server.ts",
    port: 3100,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
