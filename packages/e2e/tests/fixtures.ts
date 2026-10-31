import { test as base } from "@playwright/test";
import { portsOf } from "../ports.js";

export { expect } from "@playwright/test";

export const test = base.extend<{ server: "open" | "gated" }>({
  server: ["open", { option: true }],
  baseURL: async ({ server }, use, testInfo) => {
    const port = portsOf(testInfo.parallelIndex)[server];
    await use(`http://localhost:${port}`);
  },
});
