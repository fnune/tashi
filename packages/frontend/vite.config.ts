import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const basePath = process.env.BASE_PATH ?? "";

export default defineConfig({
  base: basePath ? `${basePath}/` : "/",
  define: {
    __BASE_PATH__: JSON.stringify(basePath),
  },
  plugins: [react()],
  server: {
    proxy: {
      [`${basePath}/api`]: {
        target: "http://localhost:3000",
      },
    },
  },
});
