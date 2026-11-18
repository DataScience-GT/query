import { defineConfig } from "oxlint";

import base from "@query/oxlint-config/base.json" with { type: "json" };
import reactInternal from "@query/oxlint-config/react-internal.json" with { type: "json" };

export default defineConfig({
  extends: [base, reactInternal],
  ignorePatterns: ["**/*.config.*", "**/*.jsx"],
});
