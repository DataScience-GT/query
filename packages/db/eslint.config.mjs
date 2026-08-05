import { config } from "@query/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    // Compiled output must never be linted. A stray `src/schemas/dist` from a
    // bad outDir once made this package fail with parser errors.
    ignores: ["**/dist/**", "drizzle/**"],
  },
  {
    // Seed/maintenance scripts are CLI tools — progress output is the point.
    files: ["scripts/**/*.ts"],
    rules: { "no-console": "off" },
  },
];
