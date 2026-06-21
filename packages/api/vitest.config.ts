import { defineConfig } from "vitest/config";
import { resolve } from "path";

const pkg = (name: string) => resolve(__dirname, "node_modules", name);

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "src/.internal-tests/**/*.test.ts",
    ],
    server: {
      deps: {
        inline: [
          "drizzle-orm",
          "@trpc/server",
          "superjson",
          "zod",
          "@query/db",
        ],
      },
    },
  },
  resolve: {
    alias: {
      "@query/db": resolve(__dirname, "../db/src/index.ts"),
      "@query/auth/email": resolve(__dirname, "../auth/src/email.ts"),
      "drizzle-orm": pkg("drizzle-orm"),
      "@trpc/server": pkg("@trpc/server"),
      superjson: pkg("superjson"),
      zod: pkg("zod"),
    },
  },
});
