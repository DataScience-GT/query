import { config } from "@query/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "process",
              importNames: ["env"],
              message:
                "@query/judging-core takes its inputs as arguments. It does not read the environment.",
            },
          ],
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "path",
                "crypto",
                "node:fs",
                "node:path",
                "node:crypto",
              ],
              message:
                "@query/judging-core has no runtime dependencies and does not call Node APIs.",
            },
          ],
        },
      ],
    },
  },
];
