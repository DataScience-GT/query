import { defineConfig } from "oxlint";

import base from "@query/oxlint-config/base.json" with { type: "json" };

export default defineConfig({
  extends: [base],
  ignorePatterns: ["**/*.config.*", "drizzle/**"],
  overrides: [
    {
      files: ["scripts/**"],
      rules: {
        "no-console": "off",
        "typescript/no-non-null-assertion": "off",
        "turbo/no-undeclared-env-vars": "off",
      },
    },
  ],
});
