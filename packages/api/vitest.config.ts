import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["src/.internal-tests/**/*.test.ts"],
    alias: {
      "@query/db": resolve(__dirname, "../db/src/index.ts"),
    },
  },
});
