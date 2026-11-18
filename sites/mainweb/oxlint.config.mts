import { defineConfig } from "oxlint";

import { base, next, react } from "@query/oxlint-config";

export default defineConfig({
  extends: [base, react, next],
  ignorePatterns: ["**/*.config.*"],
  rules: {
    "no-console": "off",
  },
});
