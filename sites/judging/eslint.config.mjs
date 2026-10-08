import { config } from "@query/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  // Playwright specs sit outside tsconfig, so the typed parser cannot load them.
  { ignores: ["e2e/**"] },
];
