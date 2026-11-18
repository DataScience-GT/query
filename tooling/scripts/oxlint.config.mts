import { defineConfig } from "oxlint";

import { base } from "@query/oxlint-config";

export default defineConfig({
  extends: [base],
  ignorePatterns: ["**/*.config.*"],
  rules: {
    "no-console": "off",
    "turbo/no-undeclared-env-vars": "off",
  },
});
