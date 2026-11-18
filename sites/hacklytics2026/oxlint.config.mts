import { defineConfig } from "oxlint";

import base from "@query/oxlint-config/base.json" with { type: "json" };
import react from "@query/oxlint-config/react.json" with { type: "json" };

export default defineConfig({
  extends: [base, react],
  ignorePatterns: ["**/*.config.*"],
});
