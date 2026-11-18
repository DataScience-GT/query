import { defineConfig } from "oxlint";

import { base, reactInternal } from "@query/oxlint-config";

export default defineConfig({
  extends: [base, reactInternal],
  ignorePatterns: ["**/*.config.*", "**/*.jsx"],
});
