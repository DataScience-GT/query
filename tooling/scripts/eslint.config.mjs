import { config } from "@query/eslint-config/base";

// These are command-line tools: they print to the console, and their env
// variables belong to the caller, not to a turbo task, so they are not
// declared in turbo.json.
/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["**/*.ts"],
    rules: {
      "no-console": "off",
      "turbo/no-undeclared-env-vars": "off",
    },
  },
];
