import { defineConfig } from "oxlint";

import base from "@query/oxlint-config/base.json" with { type: "json" };

export default defineConfig({
  extends: [base],
  ignorePatterns: ["**/*.config.*"],
  rules: {
    "typescript/no-non-null-assertion": "off",
  },
  overrides: [
    {
      files: ["src/.internal-tests/**/*.ts"],
      rules: {
        "typescript/no-explicit-any": "off",
        "typescript/no-namespace": "off",
      },
    },
  ],
});
