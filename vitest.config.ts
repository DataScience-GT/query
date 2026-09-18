import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Root config for `pnpm test`. The only thing it adds is mainweb's `@` alias,
// which is a tsconfig path Node cannot resolve on its own — without it, a test
// cannot import a route handler.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "sites/mainweb"),
    },
  },
});
