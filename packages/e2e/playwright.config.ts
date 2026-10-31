import { defineConfig, devices } from "@playwright/test";
import { E2E_WORKERS, portsOf, SLOTS } from "./ports.js";

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
          command: `npx tsx test-server.ts ${E2E_WORKERS}`,
          port: portsOf(E2E_WORKERS - 1).gated,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : SLOTS.flatMap((slot) => [
        worker(portsOf(slot).open, `e2e-open-${slot}`),
        worker(portsOf(slot).gated, `e2e-gated-${slot}`, [
          "E2E_WITH_ACCOUNTS:yes",
        ]),
      ]);

export default defineConfig({
  testDir: "./tests",
  timeout: 15_000,
  workers: E2E_WORKERS,
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: servers,
});
