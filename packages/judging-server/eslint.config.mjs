import { config } from "@query/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["src/log.ts", "src/index.ts"],
    rules: { "no-console": "off" },
  },
];
