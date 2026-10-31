import { defineConfig, devices } from "@playwright/test";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function worker(port: number, state: string, vars: string[] = []) {
  const wrangler = "pnpm exec wrangler";
  const config = "-c wrangler.test.jsonc";
  const persist = `--persist-to .wrangler/${state}`;
  const flags = [`E2E_TIME_ZONE:${timeZone}`, ...vars]
    .map((v) => `--var ${v}`)
    .join(" ");
  return {
    command: [
      `rm -rf .wrangler/${state}`,
      `CI=1 ${wrangler} dev ${config} ${persist} --port ${port} --inspector-port 0 ${flags}`,
    ].join(" && "),
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  };
}

const servers =
  process.env.E2E_RUNTIME === "node"
    ? [
        {
          command: "npx tsx test-server.ts",
          port: 3100,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : [
        worker(3100, "e2e-open"),
        worker(3101, "e2e-gated", ["E2E_WITH_ACCOUNTS:yes"]),
      ];

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
  webServer: servers,
});
