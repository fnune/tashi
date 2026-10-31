import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative URLs let one build serve under any path: the server sets <base href>.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:3000" },
    },
  },
});
