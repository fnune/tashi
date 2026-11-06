import { execFileSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function builtCommit(): string {
  const fromCloudflare = process.env.WORKERS_CI_COMMIT_SHA;
  if (fromCloudflare) return fromCloudflare.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

// Relative URLs let one build serve under any path: the server sets <base href>.
export default defineConfig({
  base: "./",
  define: { __TASHI_COMMIT__: JSON.stringify(builtCommit()) },
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:3000" },
    },
  },
});
