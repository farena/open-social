import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-db.ts"],
    include: [
      "tests/**/*.test.ts",
      "scripts/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.ts",
    ],
  },
});
